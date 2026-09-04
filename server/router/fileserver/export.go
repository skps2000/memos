package fileserver

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pkg/errors"

	"github.com/usememos/memos/server/access"
	"github.com/usememos/memos/store"
)

const (
	// exportCommentLimit caps how many comments one export bundle carries. Exports
	// are a snapshot for a reader, not a backup channel for an unbounded thread.
	exportCommentLimit = 500

	// exportMarkdownName and exportMetadataName are the bundle entries that hold the
	// memo itself. Attachments sit beside them under exportAttachmentDir.
	exportMarkdownName  = "memo.md"
	exportMetadataName  = "memo.json"
	exportAttachmentDir = "attachments"
)

// managedAttachmentOriginPrefix optionally consumes the origin in front of an
// attachment path, so an absolute URL is replaced whole rather than leaving the
// host stitched onto a relative bundle path.
const managedAttachmentOriginPrefix = `(?:https?://[^\s)\]"']*?)?`

// managedAttachmentGenericSegment matches a filename segment that was written
// without spaces — the fallback for references that do not carry the exact
// filename this instance has on record.
const managedAttachmentGenericSegment = `[^\s)\]"']*`

// exportDocument is the JSON shape of an exported memo. It carries everything the
// reader of a share link can already see on the page, so the bundle stands on its
// own once the link is gone.
type exportDocument struct {
	Name        string             `json:"name"`
	UID         string             `json:"uid"`
	Creator     string             `json:"creator"`
	CreateTime  string             `json:"createTime"`
	UpdateTime  string             `json:"updateTime"`
	Visibility  string             `json:"visibility"`
	Pinned      bool               `json:"pinned"`
	Title       string             `json:"title,omitempty"`
	Tags        []string           `json:"tags"`
	Location    *exportLocation    `json:"location,omitempty"`
	Content     string             `json:"content"`
	Attachments []exportAttachment `json:"attachments"`
	Reactions   []exportReaction   `json:"reactions"`
	Comments    []exportComment    `json:"comments"`
	ExportTime  string             `json:"exportTime"`
}

type exportLocation struct {
	Placeholder string  `json:"placeholder,omitempty"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
}

type exportAttachment struct {
	UID      string `json:"uid"`
	Filename string `json:"filename"`
	Type     string `json:"type"`
	Size     int64  `json:"size"`
	// Path is where the file lives relative to the bundle root, or the URL that
	// serves it when the export is a single file rather than an archive.
	Path string `json:"path"`
}

type exportReaction struct {
	Creator string `json:"creator"`
	Type    string `json:"type"`
}

type exportComment struct {
	UID        string `json:"uid"`
	Creator    string `json:"creator"`
	CreateTime string `json:"createTime"`
	Content    string `json:"content"`
}

// exportBundle is the resolved memo plus everything that travels with it.
type exportBundle struct {
	memo        *store.Memo
	document    *exportDocument
	attachments []*store.Attachment
	// bundlePaths maps an attachment ID to its path inside the archive.
	bundlePaths map[int32]string
}

// exportOptions carries what the caller is allowed to see in the bundle.
type exportOptions struct {
	includeComments bool
}

// exportMemo exports a memo for a caller that can already read it through the API.
func (s *FileServerService) exportMemo(c *echo.Context) error {
	ctx := c.Request().Context()
	uid := c.Param("uid")

	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: &uid})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to get memo").Wrap(err)
	}
	if memo == nil {
		return echo.NewHTTPError(http.StatusNotFound, "memo not found")
	}

	var parent *store.Memo
	if memo.ParentUID != nil {
		parent, err = s.Store.GetMemo(ctx, &store.FindMemo{UID: memo.ParentUID})
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to get parent memo").Wrap(err)
		}
		if parent == nil {
			return echo.NewHTTPError(http.StatusNotFound, "memo not found")
		}
	}

	user, err := s.getCurrentUser(ctx, c)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to get current user").Wrap(err)
	}
	allowAnonymous := s.Profile != nil && s.Profile.AllowAnonymous()
	if err := memoReadHTTPError(access.CheckMemoRead(memo, parent, user, allowAnonymous, nil)); err != nil {
		return err
	}

	return s.writeMemoExport(c, memo, exportOptions{includeComments: true})
}

// exportSharedMemo exports the memo behind a share link. The token is the only
// credential, so it is held to exactly what it grants: this memo, while the link
// is live, and only when the link was created with downloads enabled.
func (s *FileServerService) exportSharedMemo(c *echo.Context) error {
	ctx := c.Request().Context()
	token := c.Param("token")

	ms, err := s.Store.GetMemoShare(ctx, &store.FindMemoShare{UID: &token})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to get memo share").Wrap(err)
	}
	// An invalid token and an expired one fail identically — neither reveals that
	// the other kind of link exists.
	if ms == nil || isMemoShareExpired(ms) {
		return echo.NewHTTPError(http.StatusNotFound, "not found")
	}
	if !ms.AllowDownload {
		return echo.NewHTTPError(http.StatusForbidden, "downloads are disabled for this share link")
	}

	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{ID: &ms.MemoID})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to get memo").Wrap(err)
	}
	// Archived, deleted, and demoted-to-comment memos are all "not found" here, the
	// same as they are for GetSharedMemo.
	if memo == nil || memo.RowStatus != store.Normal || memo.ParentUID != nil {
		return echo.NewHTTPError(http.StatusNotFound, "not found")
	}

	return s.writeMemoExport(c, memo, exportOptions{includeComments: ms.IncludeComments})
}

// writeMemoExport builds the bundle and writes it in the requested format.
func (s *FileServerService) writeMemoExport(c *echo.Context, memo *store.Memo, opts exportOptions) error {
	ctx := c.Request().Context()

	format := strings.ToLower(strings.TrimSpace(c.QueryParam("format")))
	if format == "" {
		format = "zip"
	}
	if format != "zip" && format != "json" && format != "md" && format != "markdown" {
		return echo.NewHTTPError(http.StatusBadRequest, "unsupported format: use zip, md, or json")
	}

	bundle, err := s.buildExportBundle(ctx, memo, opts, format == "zip")
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to build memo export").Wrap(err)
	}

	setSecurityHeaders(c)
	c.Response().Header().Set(echo.HeaderCacheControl, privateAttachmentCacheControl)

	switch format {
	case "json":
		body, err := json.MarshalIndent(bundle.document, "", "  ")
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to encode memo export").Wrap(err)
		}
		setExportDownloadHeaders(c, "application/json; charset=utf-8", memo.UID, "json")
		return c.Blob(http.StatusOK, "application/json; charset=utf-8", body)
	case "md", "markdown":
		setExportDownloadHeaders(c, "text/markdown; charset=utf-8", memo.UID, "md")
		return c.Blob(http.StatusOK, "text/markdown; charset=utf-8", []byte(renderExportMarkdown(bundle.document)))
	default:
		return s.writeMemoExportArchive(ctx, c, bundle)
	}
}

// writeMemoExportArchive streams the bundle as a zip. The response is committed as
// soon as the first entry is written, so an attachment that cannot be read is
// logged and skipped rather than failing an archive the client is already reading.
func (s *FileServerService) writeMemoExportArchive(ctx context.Context, c *echo.Context, bundle *exportBundle) error {
	metadata, err := json.MarshalIndent(bundle.document, "", "  ")
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to encode memo export").Wrap(err)
	}
	markdown := []byte(renderExportMarkdown(bundle.document))

	setExportDownloadHeaders(c, "application/zip", bundle.memo.UID, "zip")
	c.Response().WriteHeader(http.StatusOK)

	zw := zip.NewWriter(c.Response())
	if err := s.writeArchiveEntries(ctx, zw, bundle, markdown, metadata); err != nil {
		_ = zw.Close()
		return err
	}
	return zw.Close()
}

// writeArchiveEntries fills the archive. An attachment that cannot be read is
// logged and skipped: the response is already committed, and the rest of the
// bundle is still worth delivering.
func (s *FileServerService) writeArchiveEntries(ctx context.Context, zw *zip.Writer, bundle *exportBundle, markdown, metadata []byte) error {
	root := "memo-" + bundle.memo.UID

	if err := writeZIPFile(zw, root+"/"+exportMarkdownName, markdown); err != nil {
		return err
	}
	if err := writeZIPFile(zw, root+"/"+exportMetadataName, metadata); err != nil {
		return err
	}

	for _, attachment := range bundle.attachments {
		path := bundle.bundlePaths[attachment.ID]
		if path == "" {
			continue
		}
		if err := s.writeZIPAttachment(ctx, zw, root+"/"+path, attachment); err != nil {
			slog.Warn("skipping attachment in memo export",
				slog.String("memo_uid", bundle.memo.UID),
				slog.String("attachment_uid", attachment.UID),
				slog.Any("err", err))
		}
	}
	return nil
}

// writeZIPAttachment copies one attachment into the archive, streaming it so a
// large file never has to sit in memory in full.
func (s *FileServerService) writeZIPAttachment(ctx context.Context, zw *zip.Writer, path string, attachment *store.Attachment) error {
	// Database-backed attachments carry their bytes in the row, which the listing
	// deliberately left behind; re-read this one so the blob is loaded on its own.
	full, err := s.Store.GetAttachment(ctx, &store.FindAttachment{ID: &attachment.ID, GetBlob: true})
	if err != nil {
		return errors.Wrap(err, "failed to get attachment")
	}
	if full == nil {
		return errors.New("attachment not found")
	}

	reader, err := s.getAttachmentReader(ctx, full)
	if err != nil {
		return err
	}
	defer reader.Close()

	writer, err := zw.CreateHeader(&zip.FileHeader{
		Name:     path,
		Method:   zip.Deflate,
		Modified: time.Unix(full.CreatedTs, 0).UTC(),
	})
	if err != nil {
		return errors.Wrap(err, "failed to create archive entry")
	}
	if _, err := io.Copy(writer, reader); err != nil {
		return errors.Wrap(err, "failed to write archive entry")
	}
	return nil
}

func writeZIPFile(zw *zip.Writer, path string, body []byte) error {
	writer, err := zw.Create(path)
	if err != nil {
		return errors.Wrap(err, "failed to create archive entry")
	}
	if _, err := writer.Write(body); err != nil {
		return errors.Wrap(err, "failed to write archive entry")
	}
	return nil
}

// buildExportBundle collects the memo and everything shown alongside it. When
// forArchive is set, attachment references in the content are pointed at the
// archive's own copies so the bundle reads correctly offline.
func (s *FileServerService) buildExportBundle(ctx context.Context, memo *store.Memo, opts exportOptions, forArchive bool) (*exportBundle, error) {
	creator, err := s.Store.GetUser(ctx, &store.FindUser{ID: &memo.CreatorID})
	if err != nil {
		return nil, errors.Wrap(err, "failed to get memo creator")
	}

	attachments, err := s.Store.ListAttachments(ctx, &store.FindAttachment{MemoID: &memo.ID})
	if err != nil {
		return nil, errors.Wrap(err, "failed to list attachments")
	}

	bundlePaths := make(map[int32]string, len(attachments))
	used := make(map[string]bool, len(attachments))
	exported := make([]exportAttachment, 0, len(attachments))
	for _, attachment := range attachments {
		name := uniqueAttachmentName(attachment.Filename, attachment.UID, used)
		path := exportAttachmentDir + "/" + name
		bundlePaths[attachment.ID] = path

		reference := path
		if !forArchive {
			reference = fmt.Sprintf("/file/attachments/%s/%s", attachment.UID, attachment.Filename)
		}
		exported = append(exported, exportAttachment{
			UID:      attachment.UID,
			Filename: attachment.Filename,
			Type:     attachment.Type,
			Size:     attachment.Size,
			Path:     reference,
		})
	}

	reactions, err := s.listExportReactions(ctx, memo)
	if err != nil {
		return nil, err
	}

	comments := []exportComment{}
	if opts.includeComments {
		comments, err = s.listExportComments(ctx, memo)
		if err != nil {
			return nil, err
		}
	}

	content := memo.Content
	if forArchive {
		content = rewriteAttachmentReferences(content, attachments, bundlePaths)
	}

	document := &exportDocument{
		Name:        "memos/" + memo.UID,
		UID:         memo.UID,
		Creator:     userDisplayName(creator),
		CreateTime:  formatExportTime(memo.CreatedTs),
		UpdateTime:  formatExportTime(memo.UpdatedTs),
		Visibility:  memo.Visibility.String(),
		Pinned:      memo.Pinned,
		Tags:        []string{},
		Content:     content,
		Attachments: exported,
		Reactions:   reactions,
		Comments:    comments,
		ExportTime:  time.Now().UTC().Format(time.RFC3339),
	}
	if payload := memo.Payload; payload != nil {
		if len(payload.Tags) > 0 {
			document.Tags = payload.Tags
		}
		if payload.Property != nil {
			document.Title = payload.Property.Title
		}
		if location := payload.Location; location != nil {
			document.Location = &exportLocation{
				Placeholder: location.Placeholder,
				Latitude:    location.Latitude,
				Longitude:   location.Longitude,
			}
		}
	}

	return &exportBundle{
		memo:        memo,
		document:    document,
		attachments: attachments,
		bundlePaths: bundlePaths,
	}, nil
}

func (s *FileServerService) listExportReactions(ctx context.Context, memo *store.Memo) ([]exportReaction, error) {
	contentID := "memos/" + memo.UID
	reactions, err := s.Store.ListReactions(ctx, &store.FindReaction{ContentID: &contentID})
	if err != nil {
		return nil, errors.Wrap(err, "failed to list reactions")
	}

	creatorIDs := make([]int32, 0, len(reactions))
	for _, reaction := range reactions {
		creatorIDs = append(creatorIDs, reaction.CreatorID)
	}
	creators := s.resolveExportUsers(ctx, creatorIDs)

	exported := make([]exportReaction, 0, len(reactions))
	for _, reaction := range reactions {
		exported = append(exported, exportReaction{
			Creator: creators[reaction.CreatorID],
			Type:    reaction.ReactionType,
		})
	}
	return exported, nil
}

func (s *FileServerService) listExportComments(ctx context.Context, memo *store.Memo) ([]exportComment, error) {
	commentType := store.MemoRelationComment
	normal := store.Normal
	limit := exportCommentLimit
	relations, err := s.Store.ListMemoRelations(ctx, &store.FindMemoRelation{
		RelatedMemoID:       &memo.ID,
		Type:                &commentType,
		SourceMemoRowStatus: &normal,
		Limit:               &limit,
	})
	if err != nil {
		return nil, errors.Wrap(err, "failed to list memo relations")
	}
	if len(relations) == 0 {
		return []exportComment{}, nil
	}

	commentIDs := make([]int32, 0, len(relations))
	for _, relation := range relations {
		commentIDs = append(commentIDs, relation.MemoID)
	}
	comments, err := s.Store.ListMemos(ctx, &store.FindMemo{IDList: commentIDs, RowStatus: &normal})
	if err != nil {
		return nil, errors.Wrap(err, "failed to list memo comments")
	}

	creatorIDs := make([]int32, 0, len(comments))
	for _, comment := range comments {
		creatorIDs = append(creatorIDs, comment.CreatorID)
	}
	creators := s.resolveExportUsers(ctx, creatorIDs)

	exported := make([]exportComment, 0, len(comments))
	for _, comment := range comments {
		exported = append(exported, exportComment{
			UID:        comment.UID,
			Creator:    creators[comment.CreatorID],
			CreateTime: formatExportTime(comment.CreatedTs),
			Content:    comment.Content,
		})
	}
	return exported, nil
}

// resolveExportUsers maps creator IDs to display names. A user that cannot be
// loaded is left out rather than failing the export, since the memo itself is
// still worth handing back.
func (s *FileServerService) resolveExportUsers(ctx context.Context, ids []int32) map[int32]string {
	names := make(map[int32]string, len(ids))
	for _, id := range ids {
		if _, ok := names[id]; ok {
			continue
		}
		user, err := s.Store.GetUser(ctx, &store.FindUser{ID: &id})
		if err != nil || user == nil {
			names[id] = ""
			continue
		}
		names[id] = userDisplayName(user)
	}
	return names
}

// renderExportMarkdown renders the document as a Markdown file with YAML front
// matter, followed by the attachment list and the comments the caller may see.
func renderExportMarkdown(doc *exportDocument) string {
	var b strings.Builder

	b.WriteString("---\n")
	writeFrontMatterField(&b, "uid", doc.UID)
	if doc.Title != "" {
		writeFrontMatterField(&b, "title", doc.Title)
	}
	writeFrontMatterField(&b, "author", doc.Creator)
	writeFrontMatterField(&b, "created", doc.CreateTime)
	writeFrontMatterField(&b, "updated", doc.UpdateTime)
	writeFrontMatterField(&b, "visibility", doc.Visibility)
	b.WriteString("pinned: " + strconv.FormatBool(doc.Pinned) + "\n")
	if len(doc.Tags) > 0 {
		b.WriteString("tags:\n")
		for _, tag := range doc.Tags {
			b.WriteString("  - " + encodeYAMLString(tag) + "\n")
		}
	}
	if doc.Location != nil && doc.Location.Placeholder != "" {
		writeFrontMatterField(&b, "location", doc.Location.Placeholder)
	}
	b.WriteString("---\n\n")

	b.WriteString(strings.TrimRight(doc.Content, "\n"))
	b.WriteString("\n")

	if len(doc.Attachments) > 0 {
		b.WriteString("\n## Attachments\n\n")
		for _, attachment := range doc.Attachments {
			b.WriteString(fmt.Sprintf("- [%s](%s) — %s, %s\n",
				attachment.Filename, escapeMarkdownPath(attachment.Path), attachment.Type, formatByteSize(attachment.Size)))
		}
	}

	if len(doc.Comments) > 0 {
		b.WriteString(fmt.Sprintf("\n## Comments (%d)\n", len(doc.Comments)))
		for _, comment := range doc.Comments {
			b.WriteString(fmt.Sprintf("\n### %s — %s\n\n", comment.Creator, comment.CreateTime))
			b.WriteString(strings.TrimRight(comment.Content, "\n"))
			b.WriteString("\n")
		}
	}

	return b.String()
}

func writeFrontMatterField(b *strings.Builder, key, value string) {
	b.WriteString(key + ": " + encodeYAMLString(value) + "\n")
}

// encodeYAMLString quotes a value as JSON, which YAML accepts verbatim, so a
// title with a colon or a quote cannot break the front matter.
func encodeYAMLString(value string) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		return `""`
	}
	return string(encoded)
}

// rewriteAttachmentReferences points every reference to a memo attachment at the
// copy inside the bundle, whether it was written as an absolute URL or as a bare
// path and whether or not it carried the filename segment.
func rewriteAttachmentReferences(content string, attachments []*store.Attachment, bundlePaths map[int32]string) string {
	for _, attachment := range attachments {
		path := bundlePaths[attachment.ID]
		if path == "" {
			continue
		}
		pattern, err := regexp.Compile(managedAttachmentReferencePattern(attachment))
		if err != nil {
			continue
		}
		content = pattern.ReplaceAllLiteralString(content, escapeMarkdownPath(path))
	}
	return content
}

// managedAttachmentReferencePattern builds the expression that matches every way
// this attachment can appear in memo content. The exact filename is tried first,
// escaped and raw, so a name containing spaces is consumed in full instead of
// leaving its tail stranded in the middle of a link.
func managedAttachmentReferencePattern(attachment *store.Attachment) string {
	segments := make([]string, 0, 3)
	if escaped := (&url.URL{Path: attachment.Filename}).EscapedPath(); escaped != "" {
		segments = append(segments, regexp.QuoteMeta(escaped))
	}
	if attachment.Filename != "" {
		segments = append(segments, regexp.QuoteMeta(attachment.Filename))
	}
	segments = append(segments, managedAttachmentGenericSegment)

	return fmt.Sprintf(`%s/file/attachments/%s(?:/(?:%s))?`,
		managedAttachmentOriginPrefix, regexp.QuoteMeta(attachment.UID), strings.Join(segments, "|"))
}

// escapeMarkdownPath percent-encodes a path so a filename with a space or a
// parenthesis still resolves inside a Markdown link. Absolute URLs are left
// alone, since they were already written in whatever form the author used.
func escapeMarkdownPath(path string) string {
	if strings.Contains(path, "://") {
		return path
	}
	escaped := &url.URL{Path: path}
	return escaped.EscapedPath()
}

// uniqueAttachmentName reduces a stored filename to a safe archive entry name and
// keeps it distinct from the names already used in this bundle.
func uniqueAttachmentName(filename, fallback string, used map[string]bool) string {
	name := filepath.Base(filepath.FromSlash(filename))
	name = strings.TrimSpace(name)
	if name == "" || name == "." || name == ".." || strings.ContainsAny(name, `\/`) {
		name = fallback
	}

	candidate := name
	if used[candidate] {
		ext := filepath.Ext(name)
		stem := strings.TrimSuffix(name, ext)
		for i := 2; used[candidate]; i++ {
			candidate = fmt.Sprintf("%s (%d)%s", stem, i, ext)
		}
	}
	used[candidate] = true
	return candidate
}

func userDisplayName(user *store.User) string {
	if user == nil {
		return ""
	}
	if user.Nickname != "" {
		return user.Nickname
	}
	return user.Username
}

func formatExportTime(ts int64) string {
	return time.Unix(ts, 0).UTC().Format(time.RFC3339)
}

func formatByteSize(size int64) string {
	const unit = 1024
	if size < unit {
		return fmt.Sprintf("%d B", size)
	}
	div, exp := int64(unit), 0
	for n := size / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(size)/float64(div), "KMGTPE"[exp])
}

// setExportDownloadHeaders makes the response a download named after the memo.
func setExportDownloadHeaders(c *echo.Context, contentType, uid, extension string) {
	h := c.Response().Header()
	h.Set(echo.HeaderContentType, contentType)
	h.Set(echo.HeaderContentDisposition, fmt.Sprintf(`attachment; filename="memo-%s.%s"`, sanitizeFilenameToken(uid), extension))
}

// sanitizeFilenameToken keeps a UID safe to interpolate into a quoted
// Content-Disposition filename.
func sanitizeFilenameToken(value string) string {
	cleaned := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			return r
		case r == '-', r == '_':
			return r
		default:
			return -1
		}
	}, value)
	if cleaned == "" {
		return "export"
	}
	return cleaned
}

// memoReadHTTPError maps an access decision onto the HTTP status the file routes
// use, keeping "does not exist" and "exists but is not yours" distinguishable only
// where the API already distinguishes them.
func memoReadHTTPError(decision access.MemoReadDecision) error {
	switch decision.Denial {
	case access.MemoReadDenialNone:
		return nil
	case access.MemoReadDenialUnauthenticated:
		return echo.NewHTTPError(http.StatusUnauthorized, "unauthorized access")
	case access.MemoReadDenialPermission:
		return echo.NewHTTPError(http.StatusForbidden, "forbidden access")
	default:
		return echo.NewHTTPError(http.StatusNotFound, "memo not found")
	}
}
