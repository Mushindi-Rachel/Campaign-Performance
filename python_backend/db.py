"""
Database client — shared Supabase connection for all ingestion and AI modules.
Uses the service role key to bypass RLS for server-side writes.
"""

from supabase import create_client, Client

from config import config

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY)
    return _client


def upsert_rows(table: str, rows: list[dict], on_conflict: str) -> int:
    """
    Upsert rows into a table, handling unique constraint conflicts.
    Returns the number of rows upserted.
    """
    if not rows:
        return 0
    client = get_client()
    result = client.table(table).upsert(rows, on_conflict=on_conflict).execute()
    return len(result.data) if result.data else 0


def log_ingestion(source: str, status: str, rows: int = 0, error: str | None = None) -> None:
    """Record a pipeline run in the ingestion_log table."""
    client = get_client()
    client.table("ingestion_log").insert({
        "source": source,
        "status": status,
        "rows_processed": rows,
        "error_message": error,
        "completed_at": "now()" if status != "running" else None,
    }).execute()
