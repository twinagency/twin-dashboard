"""Test named-owner SQL on a disposable PostgreSQL fixture; no Supabase account is contacted."""
from pathlib import Path
from sqlalchemy import text
from test_onlyfans_foundation_pg import database  # noqa: F401


def test_named_identity_requires_current_named_owner_and_is_service_only(database):
    _, engine = database
    sql = Path('/opt/plan-c-owner-identity.sql').read_text().replace('begin;', '', 1).rsplit('commit;', 1)[0]
    with engine.connect() as conn:
        tx = conn.begin()
        try:
            for role in ('anon', 'authenticated', 'service_role'):
                conn.exec_driver_sql("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='"+role+"') THEN CREATE ROLE "+role+"; END IF; END $$")
            conn.exec_driver_sql("CREATE TABLE public.dashboard_owner_accounts (id uuid primary key, active boolean not null, credential_version uuid not null)")
            conn.exec_driver_sql("CREATE TABLE public.dashboard_owner_sessions (token_hash text primary key, account_id uuid, credential_version uuid, expires_at timestamptz)")
            conn.exec_driver_sql('GRANT SELECT ON public.dashboard_owner_accounts, public.dashboard_owner_sessions TO service_role')
            conn.exec_driver_sql(sql)
            uid, version = '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'
            conn.execute(text('INSERT INTO public.dashboard_owner_accounts VALUES (:u, true, :v)'), {'u':uid,'v':version})
            conn.execute(text("INSERT INTO public.dashboard_owner_sessions VALUES (:h, :u, :v, now()+interval '1 hour')"), {'h':'a'*64,'u':uid,'v':version})
            conn.execute(text("INSERT INTO public.dashboard_owner_sessions VALUES (:h, :u, :v, now()+interval '1 hour')"), {'h':'b'*64,'u':uid,'v':version})
            conn.execute(text("INSERT INTO public.dashboard_owner_sessions VALUES (:h, NULL, NULL, now()+interval '1 hour')"), {'h':'c'*64})
            def identity(h): return conn.scalar(text('SELECT public.dashboard_plan_c_owner_identity(:h)'), {'h':h})
            assert str(identity('a'*64)) == str(identity('b'*64)) == uid
            assert identity('c'*64) is None and identity('d'*64) is None
            assert not conn.scalar(text("SELECT has_function_privilege('anon','public.dashboard_plan_c_owner_identity(text)','EXECUTE')"))
            assert not conn.scalar(text("SELECT has_function_privilege('authenticated','public.dashboard_plan_c_owner_identity(text)','EXECUTE')"))
            assert conn.scalar(text("SELECT has_function_privilege('service_role','public.dashboard_plan_c_owner_identity(text)','EXECUTE')"))
            conn.execute(text("UPDATE public.dashboard_owner_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=:h"), {'h':'a'*64})
            assert identity('a'*64) is None
            conn.execute(text('UPDATE public.dashboard_owner_accounts SET active=false'))
            assert identity('b'*64) is None
            conn.execute(text("UPDATE public.dashboard_owner_accounts SET active=true,credential_version='33333333-3333-4333-8333-333333333333'"))
            assert identity('b'*64) is None
            conn.execute(text('DELETE FROM public.dashboard_owner_sessions WHERE token_hash=:h'), {'h':'b'*64})
            assert identity('b'*64) is None
        finally:
            tx.rollback()
