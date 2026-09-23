-- Guard: if any duplicate-email group has more than one ClientProfile already
-- linked to an Account, an automatic merge would require deleting one of
-- those logins -- a decision this migration deliberately refuses to make
-- silently. Surface it as a hard failure instead so it gets resolved by hand.
DO $$
DECLARE
  conflict_email TEXT;
BEGIN
  SELECT cp.email INTO conflict_email
  FROM "ClientProfile" cp
  JOIN "Account" a ON a."clientProfileId" = cp.id
  GROUP BY cp.email
  HAVING count(*) > 1
  LIMIT 1;

  IF conflict_email IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot deduplicate ClientProfile.email: % has multiple ClientProfile rows each linked to their own Account', conflict_email;
  END IF;
END $$;

-- Pick one "keeper" ClientProfile per duplicate email: the row already linked
-- to an Account if the group has one, else the earliest-created row.
CREATE TEMP TABLE "_client_profile_email_merge" AS
WITH ranked AS (
  SELECT
    cp.id,
    cp.email,
    ROW_NUMBER() OVER (
      PARTITION BY cp.email
      ORDER BY
        (EXISTS (SELECT 1 FROM "Account" a WHERE a."clientProfileId" = cp.id)) DESC,
        cp."createdAt" ASC,
        cp.id ASC
    ) AS rn
  FROM "ClientProfile" cp
),
keepers AS (
  SELECT email, id AS keeper_id FROM ranked WHERE rn = 1
)
SELECT r.id AS duplicate_id, k.keeper_id
FROM ranked r
JOIN keepers k ON k.email = r.email
WHERE r.rn > 1;

-- Reassign every reference off the duplicate profiles onto their keeper
-- before deleting them, so booking/account history carries forward intact.
UPDATE "BookingRequest" br
SET "clientId" = m.keeper_id
FROM "_client_profile_email_merge" m
WHERE br."clientId" = m.duplicate_id;

UPDATE "Account" a
SET "clientProfileId" = m.keeper_id
FROM "_client_profile_email_merge" m
WHERE a."clientProfileId" = m.duplicate_id;

DELETE FROM "ClientProfile" cp
USING "_client_profile_email_merge" m
WHERE cp.id = m.duplicate_id;

DROP TABLE "_client_profile_email_merge";

-- Now safe to enforce uniqueness going forward.
ALTER TABLE "ClientProfile" ADD CONSTRAINT "ClientProfile_email_key" UNIQUE ("email");
