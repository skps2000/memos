package fileserver

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/require"

	apiv1 "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/server/auth"
	apiv1service "github.com/usememos/memos/server/router/api/v1"
	"github.com/usememos/memos/store"
)

// exportFixture is a memo with one attachment, one comment, and a share link.
type exportFixture struct {
	memo       *apiv1.Memo
	attachment *apiv1.Attachment
	shareToken string
	echo       *echo.Echo
}

func newExportFixture(ctx context.Context, t *testing.T, svc *apiv1service.APIV1Service, fs *FileServerService, shareOptions *apiv1.MemoShare) exportFixture {
	t.Helper()

	creator, err := svc.Store.CreateUser(ctx, &store.User{
		Username: "export-owner",
		Role:     store.RoleUser,
		Email:    "export-owner@example.com",
	})
	require.NoError(t, err)
	creatorCtx := context.WithValue(ctx, auth.UserIDContextKey, creator.ID)

	attachment, err := svc.CreateAttachment(creatorCtx, &apiv1.CreateAttachmentRequest{
		Attachment: &apiv1.Attachment{
			Filename: "note image.png",
			Type:     "image/png",
			Content:  []byte("fake image bytes"),
		},
	})
	require.NoError(t, err)

	memo, err := svc.CreateMemo(creatorCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:     fmt.Sprintf("# Title\n\nbody text ![img](/file/%s/%s)", attachment.Name, attachment.Filename),
			Visibility:  apiv1.Visibility_PRIVATE,
			Attachments: []*apiv1.Attachment{{Name: attachment.Name}},
		},
	})
	require.NoError(t, err)

	_, err = svc.CreateMemoComment(creatorCtx, &apiv1.CreateMemoCommentRequest{
		Name: memo.Name,
		Comment: &apiv1.Memo{
			Content:    "a comment on the export",
			Visibility: apiv1.Visibility_PRIVATE,
		},
	})
	require.NoError(t, err)

	if shareOptions == nil {
		shareOptions = &apiv1.MemoShare{}
	}
	share, err := svc.CreateMemoShare(creatorCtx, &apiv1.CreateMemoShareRequest{
		Parent:    memo.Name,
		MemoShare: shareOptions,
	})
	require.NoError(t, err)

	e := echo.New()
	fs.RegisterRoutes(e)

	return exportFixture{
		memo:       memo,
		attachment: attachment,
		shareToken: share.Name[strings.LastIndex(share.Name, "/")+1:],
		echo:       e,
	}
}

func get(t *testing.T, e *echo.Echo, url string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, url, nil))
	return rec
}

func TestExportSharedMemo_ZIPCarriesMemoMetadataAndAttachment(t *testing.T) {
	ctx := context.Background()
	svc, fs, _, cleanup := newShareAttachmentTestServices(ctx, t)
	defer cleanup()

	fixture := newExportFixture(ctx, t, svc, fs, nil)
	uid := strings.TrimPrefix(fixture.memo.Name, "memos/")

	rec := get(t, fixture.echo, "/export/shares/"+fixture.shareToken)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "application/zip", rec.Header().Get(echo.HeaderContentType))
	require.Contains(t, rec.Header().Get(echo.HeaderContentDisposition), "memo-"+uid+".zip")

	reader, err := zip.NewReader(bytes.NewReader(rec.Body.Bytes()), int64(rec.Body.Len()))
	require.NoError(t, err)

	entries := map[string][]byte{}
	for _, file := range reader.File {
		rc, err := file.Open()
		require.NoError(t, err)
		body, err := io.ReadAll(rc)
		require.NoError(t, rc.Close())
		require.NoError(t, err)
		entries[file.Name] = body
	}

	root := "memo-" + uid
	require.Contains(t, entries, root+"/memo.md")
	require.Contains(t, entries, root+"/memo.json")
	require.Equal(t, []byte("fake image bytes"), entries[root+"/attachments/note image.png"])

	var document exportDocument
	require.NoError(t, json.Unmarshal(entries[root+"/memo.json"], &document))
	require.Equal(t, uid, document.UID)
	require.Equal(t, "PRIVATE", document.Visibility)
	require.Equal(t, "Title", document.Title)
	require.Len(t, document.Attachments, 1)
	require.Equal(t, "attachments/note image.png", document.Attachments[0].Path)
	require.Len(t, document.Comments, 1)
	require.Equal(t, "a comment on the export", document.Comments[0].Content)

	markdown := string(entries[root+"/memo.md"])
	require.Contains(t, markdown, "visibility: \"PRIVATE\"")
	// The reference now points at the archive's own copy, percent-encoded so the
	// space in the filename does not break the Markdown link.
	require.Contains(t, markdown, "attachments/note%20image.png")
	require.NotContains(t, markdown, "/file/attachments/")
	require.Contains(t, markdown, "## Comments (1)")
}

func TestExportSharedMemo_MarkdownAndJSONFormats(t *testing.T) {
	ctx := context.Background()
	svc, fs, _, cleanup := newShareAttachmentTestServices(ctx, t)
	defer cleanup()

	fixture := newExportFixture(ctx, t, svc, fs, nil)

	mdRec := get(t, fixture.echo, "/export/shares/"+fixture.shareToken+"?format=md")
	require.Equal(t, http.StatusOK, mdRec.Code)
	require.Equal(t, "text/markdown; charset=utf-8", mdRec.Header().Get(echo.HeaderContentType))
	// A single Markdown file has no bundled copies, so references stay pointed at
	// the instance that serves them.
	require.Contains(t, mdRec.Body.String(), "/file/attachments/")

	jsonRec := get(t, fixture.echo, "/export/shares/"+fixture.shareToken+"?format=json")
	require.Equal(t, http.StatusOK, jsonRec.Code)
	var document exportDocument
	require.NoError(t, json.Unmarshal(jsonRec.Body.Bytes(), &document))
	require.Equal(t, fixture.memo.Content, document.Content)

	badRec := get(t, fixture.echo, "/export/shares/"+fixture.shareToken+"?format=pdf")
	require.Equal(t, http.StatusBadRequest, badRec.Code)
}

func TestExportSharedMemo_OmitsCommentsWhenShareHidesThem(t *testing.T) {
	ctx := context.Background()
	svc, fs, _, cleanup := newShareAttachmentTestServices(ctx, t)
	defer cleanup()

	hidden := false
	fixture := newExportFixture(ctx, t, svc, fs, &apiv1.MemoShare{IncludeComments: &hidden})

	rec := get(t, fixture.echo, "/export/shares/"+fixture.shareToken+"?format=json")
	require.Equal(t, http.StatusOK, rec.Code)

	var document exportDocument
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &document))
	require.Empty(t, document.Comments)
}

func TestExportSharedMemo_RejectsShareWithDownloadsDisabled(t *testing.T) {
	ctx := context.Background()
	svc, fs, _, cleanup := newShareAttachmentTestServices(ctx, t)
	defer cleanup()

	disabled := false
	fixture := newExportFixture(ctx, t, svc, fs, &apiv1.MemoShare{AllowDownload: &disabled})

	rec := get(t, fixture.echo, "/export/shares/"+fixture.shareToken)
	require.Equal(t, http.StatusForbidden, rec.Code)
}

func TestExportSharedMemo_RejectsUnknownAndRevokedTokens(t *testing.T) {
	ctx := context.Background()
	svc, fs, testStore, cleanup := newShareAttachmentTestServices(ctx, t)
	defer cleanup()

	fixture := newExportFixture(ctx, t, svc, fs, nil)

	require.Equal(t, http.StatusNotFound, get(t, fixture.echo, "/export/shares/not-a-real-token").Code)

	require.NoError(t, testStore.DeleteMemoShare(ctx, &store.DeleteMemoShare{UID: &fixture.shareToken}))
	require.Equal(t, http.StatusNotFound, get(t, fixture.echo, "/export/shares/"+fixture.shareToken).Code)
}

func TestExportMemo_RequiresReadAccess(t *testing.T) {
	ctx := context.Background()
	svc, fs, _, cleanup := newShareAttachmentTestServices(ctx, t)
	defer cleanup()

	fixture := newExportFixture(ctx, t, svc, fs, nil)
	uid := strings.TrimPrefix(fixture.memo.Name, "memos/")

	// The memo is private and the request carries no credentials, so the share
	// route is the only way in.
	require.Equal(t, http.StatusUnauthorized, get(t, fixture.echo, "/export/memos/"+uid).Code)
	require.Equal(t, http.StatusNotFound, get(t, fixture.echo, "/export/memos/does-not-exist").Code)
}

func TestRewriteAttachmentReferences(t *testing.T) {
	attachments := []*store.Attachment{{ID: 1, UID: "abc123", Filename: "note image.png"}}
	paths := map[int32]string{1: "attachments/note image.png"}

	for _, tc := range []struct {
		name    string
		content string
	}{
		{"raw filename with a space", "![img](/file/attachments/abc123/note image.png)"},
		{"percent-encoded filename", "![img](/file/attachments/abc123/note%20image.png)"},
		{"absolute url", "![img](https://memos.example.com/file/attachments/abc123/note%20image.png)"},
		{"no filename segment", "![img](/file/attachments/abc123)"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, "![img](attachments/note%20image.png)", rewriteAttachmentReferences(tc.content, attachments, paths))
		})
	}

	// A reference to an attachment that is not part of this memo is left alone.
	untouched := "![other](/file/attachments/zzz999/other.png)"
	require.Equal(t, untouched, rewriteAttachmentReferences(untouched, attachments, paths))
}
