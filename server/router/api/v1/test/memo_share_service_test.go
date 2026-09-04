package test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"google.golang.org/protobuf/types/known/fieldmaskpb"
	"google.golang.org/protobuf/types/known/timestamppb"

	apiv1 "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

func TestDeleteMemoShare_VerifiesShareBelongsToMemo(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	userOne, err := ts.CreateRegularUser(ctx, "share-owner-one")
	require.NoError(t, err)
	userTwo, err := ts.CreateRegularUser(ctx, "share-owner-two")
	require.NoError(t, err)

	userOneCtx := ts.CreateUserContext(ctx, userOne.ID)
	userTwoCtx := ts.CreateUserContext(ctx, userTwo.ID)

	memoOne, err := ts.Service.CreateMemo(userOneCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "memo one",
			Visibility: apiv1.Visibility_PRIVATE,
		},
	})
	require.NoError(t, err)

	memoTwo, err := ts.Service.CreateMemo(userTwoCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "memo two",
			Visibility: apiv1.Visibility_PRIVATE,
		},
	})
	require.NoError(t, err)

	share, err := ts.Service.CreateMemoShare(userTwoCtx, &apiv1.CreateMemoShareRequest{
		Parent:    memoTwo.Name,
		MemoShare: &apiv1.MemoShare{},
	})
	require.NoError(t, err)

	shareToken := share.Name[strings.LastIndex(share.Name, "/")+1:]
	forgedName := memoOne.Name + "/shares/" + shareToken

	_, err = ts.Service.DeleteMemoShare(userOneCtx, &apiv1.DeleteMemoShareRequest{
		Name: forgedName,
	})
	require.Error(t, err)
	require.Equal(t, codes.NotFound, status.Code(err))

	sharedMemo, err := ts.Service.GetSharedMemo(ctx, &apiv1.GetSharedMemoRequest{
		ShareToken: shareToken,
	})
	require.NoError(t, err)
	require.Equal(t, memoTwo.Name, sharedMemo.Name)
}

func TestGetSharedMemo_IncludesReactions(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	user, err := ts.CreateRegularUser(ctx, "share-reactions")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)

	memo, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "memo with reactions",
			Visibility: apiv1.Visibility_PRIVATE,
		},
	})
	require.NoError(t, err)

	reaction, err := ts.Service.UpsertMemoReaction(userCtx, &apiv1.UpsertMemoReactionRequest{
		Name: memo.Name,
		Reaction: &apiv1.Reaction{
			ContentId:    memo.Name,
			ReactionType: "👍",
		},
	})
	require.NoError(t, err)
	require.NotNil(t, reaction)

	share, err := ts.Service.CreateMemoShare(userCtx, &apiv1.CreateMemoShareRequest{
		Parent:    memo.Name,
		MemoShare: &apiv1.MemoShare{},
	})
	require.NoError(t, err)

	shareToken := share.Name[strings.LastIndex(share.Name, "/")+1:]
	sharedMemo, err := ts.Service.GetSharedMemo(ctx, &apiv1.GetSharedMemoRequest{
		ShareToken: shareToken,
	})
	require.NoError(t, err)
	require.Len(t, sharedMemo.Reactions, 1)
	require.Equal(t, "👍", sharedMemo.Reactions[0].ReactionType)
	require.Equal(t, memo.Name, sharedMemo.Reactions[0].ContentId)
}

func TestCreateMemoShare_RejectsComment(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	user, err := ts.CreateRegularUser(ctx, "share-single-memo")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)

	parent, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "parent must not be shared",
			Visibility: apiv1.Visibility_PRIVATE,
		},
	})
	require.NoError(t, err)

	comment, err := ts.Service.CreateMemoComment(userCtx, &apiv1.CreateMemoCommentRequest{
		Name: parent.Name,
		Comment: &apiv1.Memo{
			Content:    "only this memo is shared",
			Visibility: apiv1.Visibility_PRIVATE,
		},
	})
	require.NoError(t, err)
	require.NotEmpty(t, comment.Relations)

	regularMemo, err := ts.Service.GetMemo(userCtx, &apiv1.GetMemoRequest{Name: comment.Name})
	require.NoError(t, err)
	require.NotEmpty(t, regularMemo.GetParent())
	require.NotEmpty(t, regularMemo.Relations)

	_, err = ts.Service.CreateMemoShare(userCtx, &apiv1.CreateMemoShareRequest{
		Parent:    comment.Name,
		MemoShare: &apiv1.MemoShare{},
	})
	require.Equal(t, codes.FailedPrecondition, status.Code(err))

	// Legacy rows created before this rule must not remain a bypass.
	legacyShare, err := ts.Store.CreateMemoShare(ctx, &store.MemoShare{
		UID:       "legacy-comment-share",
		MemoID:    parseMemoIDFromNameForTest(t, ts, comment.Name),
		CreatorID: user.ID,
	})
	require.NoError(t, err)
	_, err = ts.Service.GetSharedMemo(ctx, &apiv1.GetSharedMemoRequest{ShareToken: legacyShare.UID})
	require.Equal(t, codes.NotFound, status.Code(err))
}

func TestGetSharedMemo_SkipsReactionsWithMissingCreators(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	owner, err := ts.CreateRegularUser(ctx, "share-owner")
	require.NoError(t, err)
	ownerCtx := ts.CreateUserContext(ctx, owner.ID)

	reactor, err := ts.CreateRegularUser(ctx, "share-reaction-orphan")
	require.NoError(t, err)
	reactorCtx := ts.CreateUserContext(ctx, reactor.ID)

	memo, err := ts.Service.CreateMemo(ownerCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "memo with orphan share reaction",
			Visibility: apiv1.Visibility_PUBLIC,
		},
	})
	require.NoError(t, err)

	_, err = ts.Service.UpsertMemoReaction(reactorCtx, &apiv1.UpsertMemoReactionRequest{
		Name: memo.Name,
		Reaction: &apiv1.Reaction{
			ContentId:    memo.Name,
			ReactionType: "👍",
		},
	})
	require.NoError(t, err)

	share, err := ts.Service.CreateMemoShare(ownerCtx, &apiv1.CreateMemoShareRequest{
		Parent:    memo.Name,
		MemoShare: &apiv1.MemoShare{},
	})
	require.NoError(t, err)

	_, err = ts.Store.DeleteUser(ctx, &store.DeleteUser{ID: reactor.ID})
	require.NoError(t, err)

	shareToken := share.Name[strings.LastIndex(share.Name, "/")+1:]
	sharedMemo, err := ts.Service.GetSharedMemo(ctx, &apiv1.GetSharedMemoRequest{
		ShareToken: shareToken,
	})
	require.NoError(t, err)
	require.Empty(t, sharedMemo.Reactions)
}

func TestGetSharedMemo_ReturnsNotFoundForUnknownShare(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	_, err := ts.Service.GetSharedMemo(ctx, &apiv1.GetSharedMemoRequest{
		ShareToken: "missing-share-token",
	})
	require.Error(t, err)
	require.Equal(t, codes.NotFound, status.Code(err))
}

func TestGetSharedMemo_ReturnsNotFoundForExpiredShare(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	user, err := ts.CreateRegularUser(ctx, "share-expired")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)

	memo, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "memo with expired share",
			Visibility: apiv1.Visibility_PRIVATE,
		},
	})
	require.NoError(t, err)

	expiredTs := time.Now().Add(-time.Hour).Unix()
	expiredShare, err := ts.Store.CreateMemoShare(ctx, &store.MemoShare{
		UID:       "expired-share-token",
		MemoID:    parseMemoIDFromNameForTest(t, ts, memo.Name),
		CreatorID: user.ID,
		ExpiresTs: &expiredTs,
	})
	require.NoError(t, err)

	_, err = ts.Service.GetSharedMemo(ctx, &apiv1.GetSharedMemoRequest{
		ShareToken: expiredShare.UID,
	})
	require.Error(t, err)
	require.Equal(t, codes.NotFound, status.Code(err))
}

func TestGetSharedMemo_ReturnsNotFoundForArchivedMemo(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	user, err := ts.CreateRegularUser(ctx, "share-archived")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)

	memoResp, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "memo that will be archived",
			Visibility: apiv1.Visibility_PRIVATE,
		},
	})
	require.NoError(t, err)

	share, err := ts.Service.CreateMemoShare(userCtx, &apiv1.CreateMemoShareRequest{
		Parent:    memoResp.Name,
		MemoShare: &apiv1.MemoShare{},
	})
	require.NoError(t, err)

	memoID := parseMemoIDFromNameForTest(t, ts, memoResp.Name)
	memo, err := ts.Store.GetMemo(ctx, &store.FindMemo{ID: &memoID})
	require.NoError(t, err)
	require.NotNil(t, memo)

	archived := store.Archived
	err = ts.Store.UpdateMemo(ctx, &store.UpdateMemo{
		ID:        memo.ID,
		RowStatus: &archived,
	})
	require.NoError(t, err)

	shareToken := share.Name[strings.LastIndex(share.Name, "/")+1:]
	_, err = ts.Service.GetSharedMemo(ctx, &apiv1.GetSharedMemoRequest{
		ShareToken: shareToken,
	})
	require.Error(t, err)
	require.Equal(t, codes.NotFound, status.Code(err))
}

func parseMemoIDFromNameForTest(t *testing.T, ts *TestService, memoName string) int32 {
	t.Helper()

	memoUID, ok := strings.CutPrefix(memoName, "memos/")
	require.True(t, ok, "memo name must start with memos/: %s", memoName)

	memo, err := ts.Store.GetMemo(context.Background(), &store.FindMemo{UID: &memoUID})
	require.NoError(t, err)
	require.NotNil(t, memo)

	return memo.ID
}

func TestCreateMemoShare_DefaultsBothOptionsToEnabled(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	user, err := ts.CreateRegularUser(ctx, "share-defaults")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)

	memo, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "memo with defaults",
			Visibility: apiv1.Visibility_PRIVATE,
		},
	})
	require.NoError(t, err)

	share, err := ts.Service.CreateMemoShare(userCtx, &apiv1.CreateMemoShareRequest{
		Parent:    memo.Name,
		MemoShare: &apiv1.MemoShare{},
	})
	require.NoError(t, err)
	require.True(t, share.GetAllowDownload())
	require.True(t, share.GetIncludeComments())

	listed, err := ts.Service.ListMemoShares(userCtx, &apiv1.ListMemoSharesRequest{Parent: memo.Name})
	require.NoError(t, err)
	require.Len(t, listed.MemoShares, 1)
	require.True(t, listed.MemoShares[0].GetAllowDownload())
	require.True(t, listed.MemoShares[0].GetIncludeComments())
}

func TestCreateMemoShare_HonorsDisabledOptions(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	user, err := ts.CreateRegularUser(ctx, "share-options-off")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)

	memo, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "memo with options off",
			Visibility: apiv1.Visibility_PRIVATE,
		},
	})
	require.NoError(t, err)

	disabled := false
	share, err := ts.Service.CreateMemoShare(userCtx, &apiv1.CreateMemoShareRequest{
		Parent: memo.Name,
		MemoShare: &apiv1.MemoShare{
			AllowDownload:   &disabled,
			IncludeComments: &disabled,
		},
	})
	require.NoError(t, err)
	require.False(t, share.GetAllowDownload())
	require.False(t, share.GetIncludeComments())
}

func TestListSharedMemoComments_ReturnsCommentsWhenIncluded(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	owner, err := ts.CreateRegularUser(ctx, "share-comments-owner")
	require.NoError(t, err)
	commenter, err := ts.CreateRegularUser(ctx, "share-comments-commenter")
	require.NoError(t, err)

	ownerCtx := ts.CreateUserContext(ctx, owner.ID)
	commenterCtx := ts.CreateUserContext(ctx, commenter.ID)

	memo, err := ts.Service.CreateMemo(ownerCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "shared memo with comments",
			Visibility: apiv1.Visibility_PUBLIC,
		},
	})
	require.NoError(t, err)

	_, err = ts.Service.CreateMemoComment(commenterCtx, &apiv1.CreateMemoCommentRequest{
		Name: memo.Name,
		Comment: &apiv1.Memo{
			Content:    "a shared comment",
			Visibility: apiv1.Visibility_PUBLIC,
		},
	})
	require.NoError(t, err)

	share, err := ts.Service.CreateMemoShare(ownerCtx, &apiv1.CreateMemoShareRequest{
		Parent:    memo.Name,
		MemoShare: &apiv1.MemoShare{},
	})
	require.NoError(t, err)
	shareToken := share.Name[strings.LastIndex(share.Name, "/")+1:]

	// Anonymous: the token is the only credential the caller has.
	resp, err := ts.Service.ListSharedMemoComments(ctx, &apiv1.ListSharedMemoCommentsRequest{
		ShareToken: shareToken,
	})
	require.NoError(t, err)
	require.Len(t, resp.Memos, 1)
	require.Equal(t, "a shared comment", resp.Memos[0].Content)
	require.Empty(t, resp.Memos[0].Relations)
}

func TestListSharedMemoComments_HidesCommentsWhenDisabled(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	owner, err := ts.CreateRegularUser(ctx, "share-comments-hidden")
	require.NoError(t, err)
	ownerCtx := ts.CreateUserContext(ctx, owner.ID)

	memo, err := ts.Service.CreateMemo(ownerCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "shared memo hiding comments",
			Visibility: apiv1.Visibility_PUBLIC,
		},
	})
	require.NoError(t, err)

	_, err = ts.Service.CreateMemoComment(ownerCtx, &apiv1.CreateMemoCommentRequest{
		Name: memo.Name,
		Comment: &apiv1.Memo{
			Content:    "a hidden comment",
			Visibility: apiv1.Visibility_PUBLIC,
		},
	})
	require.NoError(t, err)

	hidden := false
	share, err := ts.Service.CreateMemoShare(ownerCtx, &apiv1.CreateMemoShareRequest{
		Parent:    memo.Name,
		MemoShare: &apiv1.MemoShare{IncludeComments: &hidden},
	})
	require.NoError(t, err)
	shareToken := share.Name[strings.LastIndex(share.Name, "/")+1:]

	resp, err := ts.Service.ListSharedMemoComments(ctx, &apiv1.ListSharedMemoCommentsRequest{
		ShareToken: shareToken,
	})
	require.NoError(t, err)
	require.Empty(t, resp.Memos)
}

func TestListSharedMemoComments_ReturnsNotFoundForExpiredShare(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	owner, err := ts.CreateRegularUser(ctx, "share-comments-expired")
	require.NoError(t, err)
	ownerCtx := ts.CreateUserContext(ctx, owner.ID)

	memo, err := ts.Service.CreateMemo(ownerCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "expired share",
			Visibility: apiv1.Visibility_PRIVATE,
		},
	})
	require.NoError(t, err)

	share, err := ts.Service.CreateMemoShare(ownerCtx, &apiv1.CreateMemoShareRequest{
		Parent:    memo.Name,
		MemoShare: &apiv1.MemoShare{},
	})
	require.NoError(t, err)
	shareToken := share.Name[strings.LastIndex(share.Name, "/")+1:]

	expired := time.Now().Add(-time.Hour).Unix()
	stored, err := ts.Store.GetMemoShare(ctx, &store.FindMemoShare{UID: &shareToken})
	require.NoError(t, err)
	require.NotNil(t, stored)
	require.NoError(t, ts.Store.DeleteMemoShare(ctx, &store.DeleteMemoShare{UID: &shareToken}))
	_, err = ts.Store.CreateMemoShare(ctx, &store.MemoShare{
		UID:             shareToken,
		MemoID:          stored.MemoID,
		CreatorID:       stored.CreatorID,
		ExpiresTs:       &expired,
		AllowDownload:   true,
		IncludeComments: true,
	})
	require.NoError(t, err)

	_, err = ts.Service.ListSharedMemoComments(ctx, &apiv1.ListSharedMemoCommentsRequest{
		ShareToken: shareToken,
	})
	require.Error(t, err)
	require.Equal(t, codes.NotFound, status.Code(err))
}

func TestUpdateMemoShare_ChangesOptionsAndExpiry(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	user, err := ts.CreateRegularUser(ctx, "share-update-owner")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)

	memo, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{Content: "updatable share", Visibility: apiv1.Visibility_PRIVATE},
	})
	require.NoError(t, err)

	share, err := ts.Service.CreateMemoShare(userCtx, &apiv1.CreateMemoShareRequest{
		Parent:    memo.Name,
		MemoShare: &apiv1.MemoShare{},
	})
	require.NoError(t, err)
	require.True(t, share.GetAllowDownload())
	require.True(t, share.GetIncludeComments())

	disabled := false
	expireAt := time.Now().Add(48 * time.Hour)
	updated, err := ts.Service.UpdateMemoShare(userCtx, &apiv1.UpdateMemoShareRequest{
		MemoShare: &apiv1.MemoShare{
			Name:            share.Name,
			AllowDownload:   &disabled,
			IncludeComments: &disabled,
			ExpireTime:      timestamppb.New(expireAt),
		},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"allow_download", "include_comments", "expire_time"}},
	})
	require.NoError(t, err)
	require.False(t, updated.GetAllowDownload())
	require.False(t, updated.GetIncludeComments())
	require.NotNil(t, updated.ExpireTime)
	require.WithinDuration(t, expireAt, updated.ExpireTime.AsTime(), time.Minute)

	// Clearing expire_time turns the link back into one that never expires.
	cleared, err := ts.Service.UpdateMemoShare(userCtx, &apiv1.UpdateMemoShareRequest{
		MemoShare:  &apiv1.MemoShare{Name: share.Name},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"expire_time"}},
	})
	require.NoError(t, err)
	require.Nil(t, cleared.ExpireTime)
	// Options outside the mask are untouched.
	require.False(t, cleared.GetAllowDownload())
}

func TestUpdateMemoShare_RejectsOtherUsersAndBadInput(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	owner, err := ts.CreateRegularUser(ctx, "share-update-owner-2")
	require.NoError(t, err)
	stranger, err := ts.CreateRegularUser(ctx, "share-update-stranger")
	require.NoError(t, err)

	ownerCtx := ts.CreateUserContext(ctx, owner.ID)
	strangerCtx := ts.CreateUserContext(ctx, stranger.ID)

	memo, err := ts.Service.CreateMemo(ownerCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{Content: "guarded share", Visibility: apiv1.Visibility_PRIVATE},
	})
	require.NoError(t, err)
	share, err := ts.Service.CreateMemoShare(ownerCtx, &apiv1.CreateMemoShareRequest{
		Parent:    memo.Name,
		MemoShare: &apiv1.MemoShare{},
	})
	require.NoError(t, err)

	disabled := false
	_, err = ts.Service.UpdateMemoShare(strangerCtx, &apiv1.UpdateMemoShareRequest{
		MemoShare:  &apiv1.MemoShare{Name: share.Name, AllowDownload: &disabled},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"allow_download"}},
	})
	require.Error(t, err)
	require.Equal(t, codes.PermissionDenied, status.Code(err))

	_, err = ts.Service.UpdateMemoShare(ownerCtx, &apiv1.UpdateMemoShareRequest{
		MemoShare:  &apiv1.MemoShare{Name: share.Name},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"view_count"}},
	})
	require.Error(t, err)
	require.Equal(t, codes.InvalidArgument, status.Code(err))

	past := timestamppb.New(time.Now().Add(-time.Hour))
	_, err = ts.Service.UpdateMemoShare(ownerCtx, &apiv1.UpdateMemoShareRequest{
		MemoShare:  &apiv1.MemoShare{Name: share.Name, ExpireTime: past},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"expire_time"}},
	})
	require.Error(t, err)
	require.Equal(t, codes.InvalidArgument, status.Code(err))
}

func TestGetSharedMemo_CountsViews(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	user, err := ts.CreateRegularUser(ctx, "share-view-owner")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)

	memo, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{Content: "counted share", Visibility: apiv1.Visibility_PRIVATE},
	})
	require.NoError(t, err)
	share, err := ts.Service.CreateMemoShare(userCtx, &apiv1.CreateMemoShareRequest{
		Parent:    memo.Name,
		MemoShare: &apiv1.MemoShare{},
	})
	require.NoError(t, err)
	require.Zero(t, share.ViewCount)
	require.Nil(t, share.LastViewTime)

	shareToken := share.Name[strings.LastIndex(share.Name, "/")+1:]
	for range 3 {
		_, err = ts.Service.GetSharedMemo(ctx, &apiv1.GetSharedMemoRequest{ShareToken: shareToken})
		require.NoError(t, err)
	}

	listed, err := ts.Service.ListMemoShares(userCtx, &apiv1.ListMemoSharesRequest{Parent: memo.Name})
	require.NoError(t, err)
	require.Len(t, listed.MemoShares, 1)
	require.Equal(t, int32(3), listed.MemoShares[0].ViewCount)
	require.NotNil(t, listed.MemoShares[0].LastViewTime)
}
