-- Allow each owner to give their ME3 assistant a custom display name.

ALTER TABLE owner_profile ADD COLUMN assistant_name TEXT;
