package postgres

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/usememos/memos/store"
)

func (d *DB) CreateMemoShare(ctx context.Context, create *store.MemoShare) (*store.MemoShare, error) {
	fields := []string{"uid", "memo_id", "creator_id", "allow_download", "include_comments"}
	args := []any{create.UID, create.MemoID, create.CreatorID, create.AllowDownload, create.IncludeComments}

	if create.ExpiresTs != nil {
		fields = append(fields, "expires_ts")
		args = append(args, *create.ExpiresTs)
	}

	stmt := "INSERT INTO memo_share (" + strings.Join(fields, ", ") + ") VALUES (" + placeholders(len(args)) + ") RETURNING id, created_ts"
	if err := d.db.QueryRowContext(ctx, stmt, args...).Scan(
		&create.ID,
		&create.CreatedTs,
	); err != nil {
		return nil, err
	}
	return create, nil
}

func (d *DB) ListMemoShares(ctx context.Context, find *store.FindMemoShare) ([]*store.MemoShare, error) {
	where, args := []string{"1 = 1"}, []any{}

	if find.ID != nil {
		where, args = append(where, "id = "+placeholder(len(args)+1)), append(args, *find.ID)
	}
	if find.UID != nil {
		where, args = append(where, "uid = "+placeholder(len(args)+1)), append(args, *find.UID)
	}
	if find.MemoID != nil {
		where, args = append(where, "memo_id = "+placeholder(len(args)+1)), append(args, *find.MemoID)
	}
	if find.CreatorID != nil {
		where, args = append(where, "creator_id = "+placeholder(len(args)+1)), append(args, *find.CreatorID)
	}

	rows, err := d.db.QueryContext(ctx, `
		SELECT
			id,
			uid,
			memo_id,
			creator_id,
			created_ts,
			expires_ts,
			allow_download,
			include_comments,
			view_count,
			last_accessed_ts
		FROM memo_share
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY id ASC`,
		args...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []*store.MemoShare{}
	for rows.Next() {
		ms := &store.MemoShare{}
		if err := rows.Scan(
			&ms.ID,
			&ms.UID,
			&ms.MemoID,
			&ms.CreatorID,
			&ms.CreatedTs,
			&ms.ExpiresTs,
			&ms.AllowDownload,
			&ms.IncludeComments,
			&ms.ViewCount,
			&ms.LastAccessedTs,
		); err != nil {
			return nil, err
		}
		list = append(list, ms)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}
	return list, nil
}

func (d *DB) GetMemoShare(ctx context.Context, find *store.FindMemoShare) (*store.MemoShare, error) {
	where, args := []string{"1 = 1"}, []any{}

	if find.ID != nil {
		where, args = append(where, "id = "+placeholder(len(args)+1)), append(args, *find.ID)
	}
	if find.UID != nil {
		where, args = append(where, "uid = "+placeholder(len(args)+1)), append(args, *find.UID)
	}
	if find.MemoID != nil {
		where, args = append(where, "memo_id = "+placeholder(len(args)+1)), append(args, *find.MemoID)
	}
	if find.CreatorID != nil {
		where, args = append(where, "creator_id = "+placeholder(len(args)+1)), append(args, *find.CreatorID)
	}

	ms := &store.MemoShare{}
	if err := d.db.QueryRowContext(ctx, `
		SELECT
			id,
			uid,
			memo_id,
			creator_id,
			created_ts,
			expires_ts,
			allow_download,
			include_comments,
			view_count,
			last_accessed_ts
		FROM memo_share
		WHERE `+strings.Join(where, " AND ")+`
		LIMIT 1`,
		args...,
	).Scan(
		&ms.ID,
		&ms.UID,
		&ms.MemoID,
		&ms.CreatorID,
		&ms.CreatedTs,
		&ms.ExpiresTs,
		&ms.AllowDownload,
		&ms.IncludeComments,
		&ms.ViewCount,
		&ms.LastAccessedTs,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return ms, nil
}

func (d *DB) UpdateMemoShare(ctx context.Context, update *store.UpdateMemoShare) error {
	set, args := []string{}, []any{}
	if update.ClearExpiresTs {
		set = append(set, "expires_ts = NULL")
	} else if v := update.ExpiresTs; v != nil {
		set, args = append(set, "expires_ts = "+placeholder(len(args)+1)), append(args, *v)
	}
	if v := update.AllowDownload; v != nil {
		set, args = append(set, "allow_download = "+placeholder(len(args)+1)), append(args, *v)
	}
	if v := update.IncludeComments; v != nil {
		set, args = append(set, "include_comments = "+placeholder(len(args)+1)), append(args, *v)
	}
	if len(set) == 0 {
		return nil
	}
	args = append(args, update.UID)
	stmt := "UPDATE memo_share SET " + strings.Join(set, ", ") + " WHERE uid = " + placeholder(len(args))
	_, err := d.db.ExecContext(ctx, stmt, args...)
	return err
}

func (d *DB) RecordMemoShareAccess(ctx context.Context, uid string, accessedTs int64) error {
	_, err := d.db.ExecContext(ctx,
		"UPDATE memo_share SET view_count = view_count + 1, last_accessed_ts = "+placeholder(1)+" WHERE uid = "+placeholder(2),
		accessedTs, uid)
	return err
}

func (d *DB) DeleteMemoShare(ctx context.Context, delete *store.DeleteMemoShare) error {
	where, args := []string{"1 = 1"}, []any{}
	if delete.ID != nil {
		where, args = append(where, "id = "+placeholder(len(args)+1)), append(args, *delete.ID)
	}
	if delete.UID != nil {
		where, args = append(where, "uid = "+placeholder(len(args)+1)), append(args, *delete.UID)
	}
	_, err := d.db.ExecContext(ctx, "DELETE FROM memo_share WHERE "+strings.Join(where, " AND "), args...)
	return err
}
