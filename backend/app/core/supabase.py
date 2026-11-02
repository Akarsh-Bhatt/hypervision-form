from typing import Optional
from supabase import create_client, Client
from app.core.config import settings

_supabase_client: Optional[Client] = None
_supabase_admin_client: Optional[Client] = None


def get_supabase_client() -> Optional[Client]:
    """
    Returns an initialized Supabase client configured with the anonymous public key.
    Useful for operations acting under user Row-Level Security contexts.
    """
    global _supabase_client
    if _supabase_client is None:
        if (
            settings.SUPABASE_URL
            and "placeholder" not in settings.SUPABASE_URL
            and settings.SUPABASE_ANON_KEY
            and "placeholder" not in settings.SUPABASE_ANON_KEY
        ):
            _supabase_client = create_client(
                settings.SUPABASE_URL,
                settings.SUPABASE_ANON_KEY
            )
    return _supabase_client


def get_supabase_admin_client() -> Optional[Client]:
    """
    Returns an initialized Supabase admin client configured with the service role key.
    Bypasses RLS for administrative tasks and server-side aggregation/ingestion.
    """
    global _supabase_admin_client
    if _supabase_admin_client is None:
        if (
            settings.SUPABASE_URL
            and "placeholder" not in settings.SUPABASE_URL
            and settings.SUPABASE_SERVICE_ROLE_KEY
            and "placeholder" not in settings.SUPABASE_SERVICE_ROLE_KEY
        ):
            _supabase_admin_client = create_client(
                settings.SUPABASE_URL,
                settings.SUPABASE_SERVICE_ROLE_KEY
            )
    return _supabase_admin_client
