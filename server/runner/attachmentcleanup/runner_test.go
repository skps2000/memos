package attachmentcleanup_test

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/lithammer/shortuuid/v4"
	"github.com/stretchr/testify/require"

	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/server/runner/attachmentcleanup"
	"github.com/usememos/memos/store"
	teststore "github.com/usememos/memos/store/test"
)

type attachmentFixture struct {
	attachment *store.Attachment
	path       string
}

func TestRunOnceDeletesAbandonedAttachments(t *testing.T) {
	ctx := context.Background()
	testStore := teststore.NewTestingStore(ctx, t)
	defer testStore.Close()

	user, err := testStore.CreateUser(ctx, &store.User{
		Username: "cleanup-user",
		Role:     store.RoleUser,
		Email:    "cleanup-user@example.com",
	})
	require.NoError(t, err)

	memo, err := testStore.CreateMemo(ctx, &store.Memo{
		UID:        shortuuid.New(),
		CreatorID:  user.ID,
		Content:    "memo holding an attachment",
		Visibility: store.Private,
	})
	require.NoError(t, err)

	old := time.Now().Add(-60 * 24 * time.Hour).Unix()
	recent := time.Now().Add(-time.Hour).Unix()

	abandoned := createAttachment(ctx, t, testStore, user.ID, nil, old, "")
	stillDraft := createAttachment(ctx, t, testStore, user.ID, nil, recent, "")
	inUse := createAttachment(ctx, t, testStore, user.ID, &memo.ID, old, "")

	runner := attachmentcleanup.NewRunner(testStore, attachmentcleanup.DefaultRetention)
	deleted, err := runner.RunOnce(ctx)
	require.NoError(t, err)
	require.Equal(t, 1, deleted)

	requireDeleted(ctx, t, testStore, abandoned)
	requireKept(ctx, t, testStore, stillDraft)
	requireKept(ctx, t, testStore, inUse)
}

func TestRunOnceKeepsMotionGroupsThatAreStillInUse(t *testing.T) {
	ctx := context.Background()
	testStore := teststore.NewTestingStore(ctx, t)
	defer testStore.Close()

	user, err := testStore.CreateUser(ctx, &store.User{
		Username: "motion-cleanup-user",
		Role:     store.RoleUser,
		Email:    "motion-cleanup-user@example.com",
	})
	require.NoError(t, err)

	memo, err := testStore.CreateMemo(ctx, &store.Memo{
		UID:        shortuuid.New(),
		CreatorID:  user.ID,
		Content:    "memo holding a motion photo",
		Visibility: store.Private,
	})
	require.NoError(t, err)

	old := time.Now().Add(-60 * 24 * time.Hour).Unix()

	// The still image of this motion photo is bound to a memo, so its unbound
	// video sibling must survive: a motion photo only works as a whole.
	usedGroup := shortuuid.New()
	usedStill := createAttachment(ctx, t, testStore, user.ID, &memo.ID, old, usedGroup)
	usedVideo := createAttachment(ctx, t, testStore, user.ID, nil, old, usedGroup)

	// Nothing references either half of this one.
	abandonedGroup := shortuuid.New()
	abandonedStill := createAttachment(ctx, t, testStore, user.ID, nil, old, abandonedGroup)
	abandonedVideo := createAttachment(ctx, t, testStore, user.ID, nil, old, abandonedGroup)

	runner := attachmentcleanup.NewRunner(testStore, attachmentcleanup.DefaultRetention)
	deleted, err := runner.RunOnce(ctx)
	require.NoError(t, err)
	require.Equal(t, 2, deleted)

	requireKept(ctx, t, testStore, usedStill)
	requireKept(ctx, t, testStore, usedVideo)
	requireDeleted(ctx, t, testStore, abandonedStill)
	requireDeleted(ctx, t, testStore, abandonedVideo)
}

func TestRunOnceIsDisabledWithoutRetention(t *testing.T) {
	ctx := context.Background()
	testStore := teststore.NewTestingStore(ctx, t)
	defer testStore.Close()

	user, err := testStore.CreateUser(ctx, &store.User{
		Username: "disabled-cleanup-user",
		Role:     store.RoleUser,
		Email:    "disabled-cleanup-user@example.com",
	})
	require.NoError(t, err)
	abandoned := createAttachment(ctx, t, testStore, user.ID, nil, time.Now().Add(-10*365*24*time.Hour).Unix(), "")

	runner := attachmentcleanup.NewRunner(testStore, 0)
	require.False(t, runner.Enabled())
	deleted, err := runner.RunOnce(ctx)
	require.NoError(t, err)
	require.Zero(t, deleted)
	requireKept(ctx, t, testStore, abandoned)
}

// createAttachment stores an attachment backed by a real file on disk, created at
// the given timestamp, so the sweep has something to reclaim.
func createAttachment(
	ctx context.Context,
	t *testing.T,
	testStore *store.Store,
	creatorID int32,
	memoID *int32,
	createdTs int64,
	motionGroupID string,
) *attachmentFixture {
	t.Helper()

	uid := shortuuid.New()
	reference := filepath.ToSlash(filepath.Join("assets", uid+".bin"))
	path := filepath.Join(testStore.GetDataDir(), filepath.FromSlash(reference))
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o700))
	require.NoError(t, os.WriteFile(path, []byte(uid), 0o600))

	create := &store.Attachment{
		UID:         uid,
		CreatorID:   creatorID,
		Filename:    uid + ".bin",
		Type:        "application/octet-stream",
		Size:        int64(len(uid)),
		MemoID:      memoID,
		StorageType: storepb.AttachmentStorageType_LOCAL,
		Reference:   reference,
	}
	if motionGroupID != "" {
		create.Payload = &storepb.AttachmentPayload{
			MotionMedia: &storepb.MotionMedia{GroupId: motionGroupID},
		}
	}
	attachment, err := testStore.CreateAttachment(ctx, create)
	require.NoError(t, err)

	// created_ts is filled in by the database, so backdate it here. Only integers
	// are interpolated, which keeps the statement valid on every driver.
	_, err = testStore.GetDriver().GetDB().ExecContext(ctx,
		fmt.Sprintf("UPDATE attachment SET created_ts = %d WHERE id = %d", createdTs, attachment.ID))
	require.NoError(t, err)

	return &attachmentFixture{attachment: attachment, path: path}
}

func requireDeleted(ctx context.Context, t *testing.T, testStore *store.Store, fixture *attachmentFixture) {
	t.Helper()
	stored, err := testStore.GetAttachment(ctx, &store.FindAttachment{ID: &fixture.attachment.ID})
	require.NoError(t, err)
	require.Nil(t, stored, "attachment %s should have been deleted", fixture.attachment.UID)
	_, err = os.Stat(fixture.path)
	require.ErrorIs(t, err, os.ErrNotExist, "the file of attachment %s should have been deleted", fixture.attachment.UID)
}

func requireKept(ctx context.Context, t *testing.T, testStore *store.Store, fixture *attachmentFixture) {
	t.Helper()
	stored, err := testStore.GetAttachment(ctx, &store.FindAttachment{ID: &fixture.attachment.ID})
	require.NoError(t, err)
	require.NotNil(t, stored, "attachment %s should have been kept", fixture.attachment.UID)
	require.FileExists(t, fixture.path)
}
