-- Fix category display_order to match actual ceremony presentation order.
-- Run this in the Supabase SQL Editor.

UPDATE categories SET display_order =  1 WHERE name ILIKE '%Supporting Actress%';
UPDATE categories SET display_order =  2 WHERE name ILIKE '%Animated%Feature%';
UPDATE categories SET display_order =  3 WHERE name ILIKE '%Animated%Short%';
UPDATE categories SET display_order =  4 WHERE name ILIKE '%Costume%';
UPDATE categories SET display_order =  5 WHERE name ILIKE '%Makeup%' OR name ILIKE '%Hairstyling%';
UPDATE categories SET display_order =  6 WHERE name ILIKE '%Casting%';
UPDATE categories SET display_order =  7 WHERE name ILIKE '%Live Action Short%';
UPDATE categories SET display_order =  8 WHERE name ILIKE '%Supporting Actor%';
UPDATE categories SET display_order =  9 WHERE name ILIKE '%Adapted Screenplay%';
UPDATE categories SET display_order = 10 WHERE name ILIKE '%Original Screenplay%';
UPDATE categories SET display_order = 11 WHERE name ILIKE '%Production Design%';
UPDATE categories SET display_order = 12 WHERE name ILIKE '%Visual Effects%';
UPDATE categories SET display_order = 13 WHERE name ILIKE '%Documentary Short%';
UPDATE categories SET display_order = 14 WHERE name ILIKE '%Documentary Feature%';
UPDATE categories SET display_order = 15 WHERE name ILIKE '%Original Score%';
UPDATE categories SET display_order = 16 WHERE name ILIKE '%Sound%' AND name NOT ILIKE '%Song%';
UPDATE categories SET display_order = 17 WHERE name ILIKE '%Film Editing%' OR name ILIKE '%Editing%';
UPDATE categories SET display_order = 18 WHERE name ILIKE '%Cinematography%';
UPDATE categories SET display_order = 19 WHERE name ILIKE '%International%';
UPDATE categories SET display_order = 20 WHERE name ILIKE '%Original Song%';
UPDATE categories SET display_order = 21 WHERE name ILIKE '%Director%';
UPDATE categories SET display_order = 22 WHERE name ILIKE '%Actor%' AND name ILIKE '%Leading%';
UPDATE categories SET display_order = 23 WHERE name ILIKE '%Actress%' AND name ILIKE '%Leading%';
UPDATE categories SET display_order = 24 WHERE name ILIKE '%Best Picture%';

-- Verify the result:
SELECT id, name, display_order FROM categories ORDER BY display_order;
