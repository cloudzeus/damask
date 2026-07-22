-- Οι δευτερεύοντες ρόλοι γίνονται διαγράψιμοι (system=false).
-- Προστατευμένοι (system=true) μένουν: SUPER_ADMIN, ADMIN, MANAGER, EMPLOYEE, CUSTOMER.
UPDATE "Role" SET "system" = false WHERE "name" IN ('SUPPLIER', 'ARCHITECT', 'SALESMAN');
