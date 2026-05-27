-- Only "Outros" is required as the safe destination when deleting categories
-- that still have linked expenses. Other default categories are group-scoped
-- models and can be removed from the active trip when empty.
update public.expense_categories
set is_protected = false
where category_key <> 'Outros'
  and is_protected is true;
