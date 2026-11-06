import re

from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return password_hash.verify(password, hashed_password)


def normalize_mobile(value: str) -> str:
    normalized = re.sub(r"[\s()-]", "", value)
    if not re.fullmatch(r"\+?[0-9]{6,20}", normalized):
        raise ValueError("Invalid mobile number.")
    return f"+{normalized.lstrip('+')}"
