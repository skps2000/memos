// Package attachmentcleanup reclaims the space taken by attachments that were
// uploaded but never bound to a memo. Every other deletion path already removes
// the stored file, but an upload the user walked away from is referenced by
// nothing and would otherwise be kept forever.
package attachmentcleanup

import (
	"context"
	"log/slog"
	"time"

	"github.com/pkg/errors"

	"github.com/usememos/memos/store"
)

const (
	// JobName identifies the sweep in scheduler logs.
	JobName = "orphan-attachment-cleanup"
	// Schedule runs the sweep nightly, off the busiest hours.
	Schedule = "17 3 * * *"
	// DefaultRetention is how long an attachment that is bound to no memo is kept
	// before it counts as abandoned. It only has to outlast a long editing session,
	// since an attachment is bound as soon as its memo is saved.
	DefaultRetention = 30 * 24 * time.Hour

	// maxDeletionsPerRun bounds one sweep so a large backlog is worked off over
	// several nights instead of hammering storage in a single pass.
	maxDeletionsPerRun = 500
)

// Runner deletes abandoned attachments, storage included.
type Runner struct {
	store     *store.Store
	retention time.Duration
}

// NewRunner returns a runner that deletes unbound attachments older than retention.
// A retention of zero or less disables the sweep.
func NewRunner(store *store.Store, retention time.Duration) *Runner {
	return &Runner{
		store:     store,
		retention: retention,
	}
}

// Enabled reports whether the runner would delete anything.
func (r *Runner) Enabled() bool {
	return r.retention > 0
}

// RunOnce deletes one batch of abandoned attachments and returns how many were
// deleted. Storage failures on a single attachment are logged and skipped so one
// unreadable file cannot block the rest of the sweep; the next run retries it.
func (r *Runner) RunOnce(ctx context.Context) (int, error) {
	if !r.Enabled() {
		return 0, nil
	}

	cutoff := time.Now().Add(-r.retention).Unix()
	limit := maxDeletionsPerRun
	candidates, err := r.store.ListAttachments(ctx, &store.FindAttachment{
		HasNoRelatedMemo: true,
		CreatedTsBefore:  &cutoff,
		Limit:            &limit,
	})
	if err != nil {
		return 0, errors.Wrap(err, "failed to list abandoned attachments")
	}
	if len(candidates) == 0 {
		return 0, nil
	}

	deletable, err := r.excludeIncompleteMotionGroups(ctx, candidates)
	if err != nil {
		return 0, err
	}

	deleted := 0
	for _, attachment := range deletable {
		if err := ctx.Err(); err != nil {
			return deleted, err
		}
		if err := r.store.DeleteAttachment(ctx, &store.DeleteAttachment{ID: attachment.ID}); err != nil {
			slog.Warn("failed to delete abandoned attachment",
				slog.String("uid", attachment.UID),
				slog.Any("err", err))
			continue
		}
		deleted++
	}
	if deleted > 0 {
		slog.Info("deleted abandoned attachments",
			slog.Int("count", deleted),
			slog.Duration("retention", r.retention))
	}
	return deleted, nil
}

// excludeIncompleteMotionGroups drops candidates that belong to a motion media
// group whose other members are still in use. A motion photo is only coherent as
// a whole, so a group is either swept entirely or left alone.
func (r *Runner) excludeIncompleteMotionGroups(ctx context.Context, candidates []*store.Attachment) ([]*store.Attachment, error) {
	candidateIDs := make(map[int32]struct{}, len(candidates))
	creatorIDs := make(map[int32]struct{})
	for _, attachment := range candidates {
		candidateIDs[attachment.ID] = struct{}{}
		if attachment.Payload.GetMotionMedia().GetGroupId() != "" {
			creatorIDs[attachment.CreatorID] = struct{}{}
		}
	}
	if len(creatorIDs) == 0 {
		return candidates, nil
	}

	// Group IDs are only unique per creator, so the members are collected the same
	// way the delete API validates them: one creator at a time.
	incompleteGroups := make(map[groupKey]bool)
	for creatorID := range creatorIDs {
		creatorAttachments, err := r.store.ListAttachments(ctx, &store.FindAttachment{
			CreatorID:        &creatorID,
			SkipDefaultLimit: true,
		})
		if err != nil {
			return nil, errors.Wrap(err, "failed to list motion media groups")
		}
		for _, attachment := range creatorAttachments {
			groupID := attachment.Payload.GetMotionMedia().GetGroupId()
			if groupID == "" {
				continue
			}
			if _, ok := candidateIDs[attachment.ID]; !ok {
				incompleteGroups[groupKey{creatorID: creatorID, groupID: groupID}] = true
			}
		}
	}

	deletable := make([]*store.Attachment, 0, len(candidates))
	for _, attachment := range candidates {
		groupID := attachment.Payload.GetMotionMedia().GetGroupId()
		if groupID != "" && incompleteGroups[groupKey{creatorID: attachment.CreatorID, groupID: groupID}] {
			continue
		}
		deletable = append(deletable, attachment)
	}
	return deletable, nil
}

type groupKey struct {
	creatorID int32
	groupID   string
}
