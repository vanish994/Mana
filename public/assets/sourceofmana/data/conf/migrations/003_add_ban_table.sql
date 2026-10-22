BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS ban (
	account_id INTEGER PRIMARY KEY,
	banned_timestamp INTEGER NOT NULL,
	unban_timestamp INTEGER NOT NULL,
	reason TEXT NOT NULL DEFAULT '',
	FOREIGN KEY (account_id) REFERENCES account(account_id)
);

ALTER TABLE account DROP COLUMN banned_timestamp;

COMMIT;