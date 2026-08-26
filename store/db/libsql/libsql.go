// Package libsql provides a database driver for remote libSQL (Turso) databases.
//
// Remote libSQL servers are SQLite-compatible and reuse the SQLite driver
// implementation for all data-access methods. Custom scalar functions
// (memos_unicode_lower, regexp) are not registered because remote servers do
// not support them; the filter layer substitutes built-in functions instead.
package libsql

import (
	"database/sql"

	"github.com/pkg/errors"
	libsqlclient "github.com/tursodatabase/libsql-client-go/libsql"

	"github.com/usememos/memos/internal/profile"
	"github.com/usememos/memos/store"
	"github.com/usememos/memos/store/db/sqlite"
)

// NewDB opens a remote libSQL (Turso) database.
//
// The DSN must be a libsql URL, e.g. "libsql://<host>", and the auth token is
// taken from profile.LibSQLAuthToken. libsql-client-go rejects auth tokens
// embedded in the DSN query string, so they are always passed separately.
func NewDB(profile *profile.Profile) (store.Driver, error) {
	// Ensure a DSN is set before attempting to open the database.
	if profile.DSN == "" {
		return nil, errors.New("dsn required")
	}
	if profile.LibSQLAuthToken == "" {
		return nil, errors.New("libsql auth token required")
	}

	connector, err := libsqlclient.NewConnector(profile.DSN, libsqlclient.WithAuthToken(profile.LibSQLAuthToken))
	if err != nil {
		return nil, errors.Wrapf(err, "failed to create libsql connector with dsn: %s", profile.DSN)
	}
	libsqlDB := sql.OpenDB(connector)

	// Reuse the SQLite driver implementation for all data-access methods;
	// libSQL is SQLite-compatible and cannot register custom scalar functions.
	return sqlite.NewDBWithConn(profile, libsqlDB), nil
}
