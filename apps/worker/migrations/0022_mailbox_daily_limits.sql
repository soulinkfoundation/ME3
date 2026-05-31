UPDATE mailbox_aliases
SET daily_inbound_limit = 200
WHERE daily_inbound_limit = 25;

UPDATE mailbox_aliases
SET daily_outbound_limit = 200
WHERE daily_outbound_limit = 25;
