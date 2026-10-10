"""Staff accounts. Examples:

    python -m app.cli create-staff --email nurse@chn.tn --name "Amira B." --role ED_STAFF --hospital charles-nicolle
    python -m app.cli create-staff --email dr.review@sahhanito.tn --name "Dr Review" --role CLINICIAN
    python -m app.cli seed-demo --password '<strong password>'     # one ED account per hospital + a clinician
    python -m app.cli list-staff

The password is read from --password or prompted (never stored in clear).
"""
import argparse
import getpass
import sys

from sqlalchemy import select

from app import hospitals
from app.db import SessionLocal, init_db
from app.models import StaffUser
from app.security import hash_password

ROLES = ('ED_STAFF', 'MANAGER', 'CLINICIAN', 'ADMIN')


def create(db, email, name, role, hospital, password):
    if role in ('ED_STAFF', 'MANAGER') and hospital not in hospitals.FACILITIES:
        sys.exit(f'Unknown hospital {hospital!r}. Keys: {", ".join(hospitals.FACILITIES)}')
    if len(password) < 10:
        sys.exit('Password must have at least 10 characters.')
    email = email.strip().lower()
    user = db.scalar(select(StaffUser).where(StaffUser.email == email)) or StaffUser(email=email)
    user.name, user.role, user.hospital_key = name, role, hospital if role in ('ED_STAFF', 'MANAGER') else None
    user.password_hash, user.active = hash_password(password), True
    db.merge(user)
    db.commit()
    print(f'ok  {email}  {role}  {hospital or "-"}')


def main(argv=None):
    p = argparse.ArgumentParser(prog='python -m app.cli')
    sub = p.add_subparsers(dest='cmd', required=True)
    c = sub.add_parser('create-staff')
    c.add_argument('--email', required=True)
    c.add_argument('--name', required=True)
    c.add_argument('--role', choices=ROLES, required=True)
    c.add_argument('--hospital')
    c.add_argument('--password')
    s = sub.add_parser('seed-demo')
    s.add_argument('--password')
    s.add_argument('--domain', default='sahhanito.tn')
    sub.add_parser('list-staff')
    args = p.parse_args(argv)
    init_db()
    db = SessionLocal()
    if args.cmd == 'create-staff':
        create(db, args.email, args.name, args.role, args.hospital, args.password or getpass.getpass('Password: '))
    elif args.cmd == 'seed-demo':
        password = args.password or getpass.getpass('Password for every demo account: ')
        for key, f in hospitals.FACILITIES.items():
            create(db, f'urgences.{key}@{args.domain}', f"Urgences {f.get('shortName') or f['name']}", 'MANAGER', key, password)
        create(db, f'clinicien@{args.domain}', 'Clinicien régulateur', 'CLINICIAN', None, password)
    else:
        for u in db.scalars(select(StaffUser).order_by(StaffUser.email)):
            print(f"{u.email:45} {u.role:10} {u.hospital_key or '-':22} {'active' if u.active else 'disabled'}")


if __name__ == '__main__':
    main()
