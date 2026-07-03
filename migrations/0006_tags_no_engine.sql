-- Tags no longer duplicate the synth engine type (the engine chip already
-- shows it); strip it from existing rows. ",a,type,b," -> ",a,b," -> "a,b".
UPDATE patches
SET tags = trim(replace(',' || tags || ',', ',' || type || ',', ','), ',')
WHERE tags != '';
