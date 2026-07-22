# Custom Roles Management — Design

**Date:** 2026-07-22
**Author:** brainstorming session
**Status:** approved (design), pending spec review

## Problem

Σήμερα οι 8 ρόλοι (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `EMPLOYEE`, `CUSTOMER`, `SUPPLIER`, `ARCHITECT`, `SALESMAN`) είναι σταθεροί: ορίζονται στο `src/lib/permissions.ts` (`ROLE_DEFAULTS`) και γίνονται seed στη βάση. Το `/roles` matrix επιτρέπει μόνο επεξεργασία των permission-assignments — **δεν υπάρχει create/delete role**. Ο super admin χρειάζεται να δημιουργεί και να διαγράφει δικούς του (custom) ρόλους.

## Goal

Ο **SUPER_ADMIN** μπορεί από το `/roles`:
1. Να **δημιουργεί** νέο ρόλο μέσα από modal, με δυνατότητα **αντιγραφής δικαιωμάτων από υπάρχοντα ρόλο**.
2. Να ορίζει αν ο νέος ρόλος είναι **εσωτερικός** (`/dashboard`) ή **B2B** (`/portal`).
3. Να **διαγράφει** custom ρόλους· αν ο ρόλος έχει χρήστες, να **μετακινεί** αυτούς τους χρήστες σε άλλον ρόλο πριν τη διαγραφή.

## Decisions (locked)

| Θέμα | Απόφαση |
|------|---------|
| Πηγή αντιγραφής permissions | Υπάρχων **ρόλος** (`copyFromRoleId`) |
| Ποιος δημιουργεί/διαγράφει | **Μόνο SUPER_ADMIN** (`role === 'SUPER_ADMIN'`) |
| Τύπος νέου ρόλου | Επιλογή στο modal: Εσωτερικός / B2B → `Role.b2b` |
| Διαγραφή ρόλου με χρήστες | **Μετακίνηση σε άλλο ρόλο** (υποχρεωτική επιλογή αντικαταστάτη), μετά διαγραφή |
| Custom ρόλοι στο matrix | Εμφανίζονται & επεξεργάζονται αυτόματα (υπάρχον `togglePermission`) |

**Out of scope (YAGNI):** μετονομασία ρόλου, per-user permission overrides, αυτόματο fallback χωρίς ερώτηση.

## Architecture

### 1. Schema — `prisma/schema.prisma`

Προσθήκη ενός πεδίου στο `Role`:

```prisma
model Role {
  id          String  @id @default(cuid())
  name        String  @unique
  description String?
  system      Boolean @default(false)
  b2b         Boolean @default(false)   // NEW: true → /portal, false → /dashboard
  users       User[]
  permissions RolePermission[]
}
```

**Migration:** νέα στήλη `b2b` (default `false`), και data-fix που θέτει `b2b=true` για `ARCHITECT`, `CUSTOMER`, `SUPPLIER` (τα σημερινά `B2B_ROLES`). Ενημέρωση `prisma/seed.ts` ώστε το `b2b` να γίνεται seed σωστά ανά ρόλο (πηγή αλήθειας: το `B2B_ROLES` set του `src/lib/role-home.ts`).

### 2. `roleHome` — `src/lib/role-home.ts`

Σήμερα κρίνει internal/B2B με hardcoded sets ονομάτων· οι custom ρόλοι δεν θα ήταν σε αυτά. Αλλαγή ώστε το home να κρίνεται από το `b2b` flag, το οποίο κουβαλάμε στο session (ίδιο pattern με `role`/`permissions`):

- `src/auth.config.ts`: `AuthUserPayload` + `verifyCredentials` επιστρέφουν `portalHome: role.b2b`.
- `src/auth.ts`: jwt callback (sign-in **και** 60s refresh) και session callback περνάνε `portalHome`.
- `src/types/next-auth.d.ts`: `Session.user.portalHome: boolean`.
- `roleHome`: δέχεται/χρησιμοποιεί το `portalHome` flag → `/portal` όταν `true`, αλλιώς `/dashboard`. Τα σημερινά `INTERNAL_ROLES`/`B2B_ROLES` sets μένουν ως fallback για κλήσεις που έχουν μόνο όνομα.

### 3. Server actions — `src/app/(app)/roles/actions.ts`

Νέο κοινό helper `requireSuperAdmin()` στο `src/lib/rbac-server.ts` (εξαγωγή του σημερινού τοπικού helper από `costs/actions.ts`, το οποίο το ξαναχρησιμοποιεί).

**`createRole(input)`**
- Guard `requireSuperAdmin()`.
- Input (zod): `name` (required), `description?`, `b2b` (boolean), `copyFromRoleId?`.
- Normalize όνομα: `trim` → spaces→`_` → uppercase· validate `^[A-Z][A-Z0-9_]*$`.
- Unique name — φιλικό μήνυμα σε Prisma `P2002` («Υπάρχει ήδη ρόλος με αυτό το όνομα»).
- Δημιουργία `Role` με `system=false`, `b2b` από input.
- Αν `copyFromRoleId`: αντιγραφή όλων των `RolePermission` του source ρόλου στον νέο (μέσα σε transaction).
- `revalidatePath('/roles')`.

**`deleteRole(roleId, reassignToRoleId?)`**
- Guard `requireSuperAdmin()`.
- Refuse αν `role.system` («Οι βασικοί ρόλοι δεν διαγράφονται»).
- Refuse διαγραφή του δικού σου ρόλου (self-guard, όπως σε `users/actions.ts`).
- Αν ο ρόλος έχει χρήστες: `reassignToRoleId` **υποχρεωτικό** (και έγκυρο, διαφορετικό ρόλο). Σε transaction: `user.updateMany({ where:{roleId}, data:{roleId:reassignToRoleId} })` → `role.delete`. Τα `RolePermission` φεύγουν με cascade.
- Αν κανένας χρήστης: απλή διαγραφή.
- `revalidatePath('/roles')` + `revalidatePath('/users')`.

### 4. UI — `src/app/(app)/roles/`

- **`CreateRoleDialog`** (νέο client component): κουμπί «Νέος ρόλος» ορατό **μόνο σε SUPER_ADMIN**. Πεδία: Όνομα, Περιγραφή (προαιρετ.), Τύπος (Εσωτερικός/B2B — radio/segmented), «Αντιγραφή δικαιωμάτων από» (Select υπάρχοντων ρόλων, προαιρετικό). Submit → `createRole`.
- **`DeleteRoleDialog`** (νέο): σε κάθε **custom** ρόλο (`!system`), εικονίδιο διαγραφής ορατό μόνο σε SUPER_ADMIN. Δείχνει πλήθος assigned χρηστών· αν `>0`, εμφανίζει υποχρεωτικό Select «Μετακίνηση χρηστών σε» (άλλοι ρόλοι). Confirm → `deleteRole`.
- `roles-matrix.tsx`: δέχεται `isSuperAdmin` prop· δείχνει τα παραπάνω controls. Το `page.tsx` περνά `session.user.role === 'SUPER_ADMIN'` και τη λίστα ρόλων (ήδη φορτώνεται). SUPER_ADMIN στήλη παραμένει locked.

### 5. Display metadata — `src/lib/role-meta.ts`

- `ROLE_COLOR_VAR`: fallback χρώμα όταν το όνομα δεν υπάρχει στο map (custom ρόλοι).
- Περιγραφή custom ρόλου: από το DB `description` (fallback στο `ROLE_DESCRIPTIONS` για system).
- Ταξινόμηση στο matrix: system ρόλοι πρώτα με canonical `ROLE_ORDER`, custom ρόλοι μετά αλφαβητικά.

## Data flow

1. SUPER_ADMIN → «Νέος ρόλος» → `createRole` → νέα `Role` (+ αντιγραμμένα `RolePermission`).
2. Ο custom ρόλος εμφανίζεται στο matrix· επεξεργασία permissions μέσω υπάρχοντος `togglePermission`.
3. Ανάθεση σε χρήστη μέσω υπάρχοντος `changeUserRole` (`/users`).
4. Λόγω 60s JWT refresh, ρόλος/permissions/`portalHome` περνάνε σε ενεργούς χρήστες χωρίς re-login.
5. Διαγραφή → (προαιρετική μετακίνηση χρηστών) → `role.delete`.

## Error handling & guards

- **Διπλός guard**: server (`requireSuperAdmin()`) + UI (κρύβει controls). Ο server είναι η αυθεντία.
- Validation ονόματος + unique (P2002 φιλικό μήνυμα).
- Δεν διαγράφεται system ρόλος, ούτε ο ρόλος του ίδιου του χρήστη.
- Διαγραφή με χρήστες → υποχρεωτική έγκυρη μετακίνηση (transaction, ώστε να μη μείνει `User.roleId` orphan).
- `SUPER_ADMIN` permission-matrix παραμένει locked (server-side στο `togglePermission` + UI).

## Testing

- `createRole`: επιτυχία + αντιγραφή permissions· απόρριψη non-SUPER_ADMIN· duplicate name· invalid name format· `b2b` σωστά persisted.
- `deleteRole`: system → refuse· self-role → refuse· με χρήστες χωρίς `reassignToRoleId` → refuse· με έγκυρο reassign → χρήστες μετακινούνται & ρόλος διαγράφεται· cascade `RolePermission`.
- `roleHome`/session: custom B2B ρόλος → `/portal`, custom internal → `/dashboard`· 60s refresh ενημερώνει `portalHome`.
- RBAC guard: `requireSuperAdmin()` σε όλα τα νέα actions.

## Files touched

- `prisma/schema.prisma` (+migration), `prisma/seed.ts`
- `src/lib/rbac-server.ts` (νέο `requireSuperAdmin`), `src/app/(app)/costs/actions.ts` (χρήση κοινού helper)
- `src/lib/role-home.ts`, `src/auth.ts`, `src/auth.config.ts`, `src/types/next-auth.d.ts`
- `src/app/(app)/roles/actions.ts`, `page.tsx`, `roles-matrix.tsx`, `CreateRoleDialog` (νέο), `DeleteRoleDialog` (νέο)
- `src/lib/role-meta.ts`
