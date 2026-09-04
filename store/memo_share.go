package store

import "context"

// MemoShare is an access grant that permits read-only access to a memo via a bearer token.
type MemoShare struct {
	ID        int32
	UID       string
	MemoID    int32
	CreatorID int32
	CreatedTs int64
	ExpiresTs *int64 // nil means the share never expires
	// AllowDownload permits the link holder to download the memo export bundle.
	AllowDownload bool
	// IncludeComments exposes the memo's comments to the link holder.
	IncludeComments bool
	// ViewCount is how many times the link has been opened.
	ViewCount int32
	// LastAccessedTs is when the link was last opened; nil means never.
	LastAccessedTs *int64
}

// FindMemoShare is used to filter memo shares in list/get queries.
type FindMemoShare struct {
	ID        *int32
	UID       *string
	MemoID    *int32
	CreatorID *int32
}

// UpdateMemoShare changes what an existing share grant permits. A nil field is
// left as it is; ExpiresTs additionally distinguishes "leave alone" (nil) from
// "never expires" (set, pointing at nil) through ClearExpiresTs.
type UpdateMemoShare struct {
	UID             string
	ExpiresTs       *int64
	ClearExpiresTs  bool
	AllowDownload   *bool
	IncludeComments *bool
}

// DeleteMemoShare identifies a share grant to remove.
type DeleteMemoShare struct {
	ID  *int32
	UID *string
}

// CreateMemoShare creates a new share grant.
func (s *Store) CreateMemoShare(ctx context.Context, create *MemoShare) (*MemoShare, error) {
	return s.driver.CreateMemoShare(ctx, create)
}

// ListMemoShares returns all share grants matching the filter.
func (s *Store) ListMemoShares(ctx context.Context, find *FindMemoShare) ([]*MemoShare, error) {
	return s.driver.ListMemoShares(ctx, find)
}

// GetMemoShare returns the first share grant matching the filter, or nil if none found.
func (s *Store) GetMemoShare(ctx context.Context, find *FindMemoShare) (*MemoShare, error) {
	return s.driver.GetMemoShare(ctx, find)
}

// UpdateMemoShare changes an existing share grant.
func (s *Store) UpdateMemoShare(ctx context.Context, update *UpdateMemoShare) error {
	return s.driver.UpdateMemoShare(ctx, update)
}

// RecordMemoShareAccess counts one use of the link and stamps the time.
func (s *Store) RecordMemoShareAccess(ctx context.Context, uid string, accessedTs int64) error {
	return s.driver.RecordMemoShareAccess(ctx, uid, accessedTs)
}

// DeleteMemoShare removes a share grant.
func (s *Store) DeleteMemoShare(ctx context.Context, delete *DeleteMemoShare) error {
	return s.driver.DeleteMemoShare(ctx, delete)
}
