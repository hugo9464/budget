do $$
declare
  other_category_id uuid;
  unclassified_category_id uuid;
begin
  select id into other_category_id
  from public.categories
  where slug = 'autres';

  if other_category_id is not null then
    select id into strict unclassified_category_id
    from public.categories
    where slug = 'a-classer';

    update public.transactions
    set category_id = unclassified_category_id,
        category_source = 'unclassified',
        category_confidence = null,
        manually_categorized = false,
        updated_at = now()
    where category_id = other_category_id;

    delete from public.categories
    where id = other_category_id;
  end if;
end
$$;
