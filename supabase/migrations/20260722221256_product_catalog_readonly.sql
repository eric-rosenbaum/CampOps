-- The shared catalog is platform-curated reference data. Camps CONSUME it; they must not
-- be able to write it (one tenant editing a table every other tenant reads makes no
-- sense). Drop the tenant-facing manage policy: SELECT stays for all authenticated users,
-- and there is now NO client write path. Seeds are added by us via migrations (service
-- role bypasses RLS).
DROP POLICY IF EXISTS "auth_manage_product_catalog" ON product_catalog;
