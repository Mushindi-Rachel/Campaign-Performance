"""
Configuration loader — reads from environment variables or .env file.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _required(name: str) -> str:
    val = os.environ.get(name, "")
    if not val:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return val


def _optional(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


class Config:
    # Supabase
    SUPABASE_URL: str = _required("SUPABASE_URL")
    SUPABASE_SERVICE_ROLE_KEY: str = _required("SUPABASE_SERVICE_ROLE_KEY")

    # Meta Marketing API
    META_ACCESS_TOKEN: str = _optional("META_ACCESS_TOKEN")
    META_AD_ACCOUNT_ID: str = _optional("META_AD_ACCOUNT_ID")

    # GA4 Data API
    GA4_PROPERTY_ID: str = _optional("GA4_PROPERTY_ID")
    GA4_CLIENT_EMAIL: str = _optional("GA4_CLIENT_EMAIL")
    GA4_PRIVATE_KEY: str = _optional("GA4_PRIVATE_KEY")

    @classmethod
    def has_meta(cls) -> bool:
        return bool(cls.META_ACCESS_TOKEN and cls.META_AD_ACCOUNT_ID)

    @classmethod
    def has_ga4(cls) -> bool:
        return bool(cls.GA4_PROPERTY_ID and cls.GA4_CLIENT_EMAIL and cls.GA4_PRIVATE_KEY)


config = Config()
