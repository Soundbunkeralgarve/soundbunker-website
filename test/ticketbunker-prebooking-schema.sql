-- Real database integration checks. Fixtures and all mutations are rolled back.
begin;
do $$
declare actor uuid:=gen_random_uuid();other_actor uuid:=gen_random_uuid();ref uuid:=gen_random_uuid();code_id uuid;small_code uuid;code_name text:='QA_'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));q jsonb;again jsonb;
begin
 insert into auth.users(id,email,email_confirmed_at) values(actor,'pricing-'||actor||'@example.test',now()),(other_actor,'pricing-'||other_actor||'@example.test',now());
 q:=public.tb_reserve_events(ref,actor,'standard','eur',4);
 if (q->>'subtotal_cents')::int<>79600 or (q->>'discount_cents')::int<>3980 or (q->>'total_cents')::int<>75620 then raise exception 'Wrong four-event bundle';end if;
 again:=public.tb_reserve_events(ref,actor,'standard','eur',4);
 if q<>again or (select count(*) from public.tb_event_prebookings where id=ref)<>1 then raise exception 'Retry created duplicate';end if;
 begin perform public.tb_reserve_events(ref,other_actor,'standard','eur',4);raise exception 'ASSERT other owner accepted';exception when others then if SQLERRM like 'ASSERT%' then raise;end if;end;
 insert into public.tb_event_discount_codes(code,kind,value,max_uses,expires_at,created_by) values(code_name,'percent',25,1,now()+interval '1 day',actor) returning id into code_id;
 q:=public.tb_reserve_events(gen_random_uuid(),actor,'standard','eur',4,code_name);
 if (q->>'total_cents')::int<>59700 or (q->>'discount_code_id')::uuid<>code_id then raise exception 'Code did not replace bundle discount';end if;
 begin perform public.tb_reserve_events(gen_random_uuid(),other_actor,'starter','eur',1,code_name);raise exception 'ASSERT exhausted code accepted';exception when others then if SQLERRM like 'ASSERT%' then raise;end if;end;
 insert into public.tb_event_discount_codes(code,kind,value,max_uses,expires_at,created_by) values(code_name||'S','percent',5,1,now()+interval '1 day',actor) returning id into small_code;
 q:=public.tb_reserve_events(gen_random_uuid(),actor,'headline','eur',8,code_name||'S');
 if (q->>'total_cents')::int<>215280 or q->>'discount_code_id' is not null then raise exception 'Discounts stacked or unused code consumed';end if;
 q:=public.tb_reserve_events(gen_random_uuid(),actor,'usage','eur',1);
 if (q->>'total_cents')::int<>9900 or (q->>'rate_cents')::int<>15 then raise exception 'Wrong large-event setup terms';end if;
 begin perform public.tb_reserve_events(gen_random_uuid(),actor,'usage','eur',4);raise exception 'ASSERT usage bundle accepted';exception when others then if SQLERRM like 'ASSERT%' then raise;end if;end;
 if has_function_privilege('authenticated','public.tb_reserve_events(uuid,uuid,text,text,integer,text,text)','EXECUTE') or has_table_privilege('authenticated','public.tb_platform_admins','SELECT') or has_table_privilege('anon','public.tb_event_discount_codes','SELECT') then raise exception 'Private access exposed';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 if exists(select 1 from public.tb_event_prebookings where owner_user_id<>actor) then raise exception 'RLS leaked another owner';end if;
end $$;
rollback;
