-- Tags no longer include the raw fx engine name (phone, delay, ...): the
-- character term (reverb/echo/lofi/...) carries the meaning. Strip each
-- row's own fx_type from its tags, same trick as 0006.
UPDATE patches
SET tags = trim(replace(',' || tags || ',', ',' || fx_type || ',', ','), ',')
WHERE fx_type IS NOT NULL AND tags != '';
