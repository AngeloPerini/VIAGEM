-- Destination knowledge used by generate-trip-plan before calling the LLM.
-- The content tables are general travel references: authenticated users may read
-- them, while writes stay restricted to backend/service role workflows.

create table if not exists public.ai_destinations (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  country_name text not null,
  city_name text,
  overview text not null,
  best_months text,
  language text,
  currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_destinations_country_code_not_blank check (length(trim(country_code)) > 0),
  constraint ai_destinations_country_name_not_blank check (length(trim(country_name)) > 0),
  constraint ai_destinations_overview_not_blank check (length(trim(overview)) > 0)
);

create unique index if not exists ai_destinations_country_city_unique
on public.ai_destinations(country_code, city_name) nulls not distinct;

create index if not exists ai_destinations_country_code_idx
on public.ai_destinations(country_code);

drop trigger if exists update_ai_destinations_updated_at on public.ai_destinations;
create trigger update_ai_destinations_updated_at
before update on public.ai_destinations
for each row execute function public.update_updated_at_column();

create table if not exists public.ai_attractions (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  country_name text not null,
  city_name text not null,
  name text not null,
  category text not null,
  description text not null,
  suggested_duration_minutes integer,
  estimated_cost numeric,
  currency text,
  best_time_to_visit text,
  official_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_attractions_country_code_not_blank check (length(trim(country_code)) > 0),
  constraint ai_attractions_country_name_not_blank check (length(trim(country_name)) > 0),
  constraint ai_attractions_city_name_not_blank check (length(trim(city_name)) > 0),
  constraint ai_attractions_name_not_blank check (length(trim(name)) > 0),
  constraint ai_attractions_description_not_blank check (length(trim(description)) > 0),
  constraint ai_attractions_duration_positive check (suggested_duration_minutes is null or suggested_duration_minutes > 0),
  constraint ai_attractions_cost_nonnegative check (estimated_cost is null or estimated_cost >= 0)
);

create unique index if not exists ai_attractions_country_city_name_unique
on public.ai_attractions(country_code, city_name, name);

create index if not exists ai_attractions_country_city_idx
on public.ai_attractions(country_code, city_name);

drop trigger if exists update_ai_attractions_updated_at on public.ai_attractions;
create trigger update_ai_attractions_updated_at
before update on public.ai_attractions
for each row execute function public.update_updated_at_column();

create table if not exists public.ai_transport_tips (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  city_from text,
  city_to text,
  transport_type text not null,
  duration_text text,
  description text not null,
  estimated_cost numeric,
  currency text,
  created_at timestamptz not null default now(),
  constraint ai_transport_tips_country_code_not_blank check (length(trim(country_code)) > 0),
  constraint ai_transport_tips_transport_type_not_blank check (length(trim(transport_type)) > 0),
  constraint ai_transport_tips_description_not_blank check (length(trim(description)) > 0),
  constraint ai_transport_tips_cost_nonnegative check (estimated_cost is null or estimated_cost >= 0)
);

create unique index if not exists ai_transport_tips_route_unique
on public.ai_transport_tips(country_code, city_from, city_to, transport_type) nulls not distinct;

create index if not exists ai_transport_tips_country_code_idx
on public.ai_transport_tips(country_code);

create table if not exists public.ai_travel_documents (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  country_name text not null,
  document_name text not null,
  description text not null,
  required boolean not null default false,
  created_at timestamptz not null default now(),
  constraint ai_travel_documents_country_code_not_blank check (length(trim(country_code)) > 0),
  constraint ai_travel_documents_country_name_not_blank check (length(trim(country_name)) > 0),
  constraint ai_travel_documents_name_not_blank check (length(trim(document_name)) > 0),
  constraint ai_travel_documents_description_not_blank check (length(trim(description)) > 0)
);

create unique index if not exists ai_travel_documents_country_name_unique
on public.ai_travel_documents(country_code, document_name);

create index if not exists ai_travel_documents_country_code_idx
on public.ai_travel_documents(country_code);

create table if not exists public.ai_generation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  group_id uuid references public.travel_groups(id) on delete set null,
  request_type text not null,
  destination_summary text not null,
  prompt_version text not null,
  model text not null,
  status text not null,
  error_message text,
  created_at timestamptz not null default now(),
  constraint ai_generation_logs_request_type_not_blank check (length(trim(request_type)) > 0),
  constraint ai_generation_logs_destination_summary_not_blank check (length(trim(destination_summary)) > 0),
  constraint ai_generation_logs_prompt_version_not_blank check (length(trim(prompt_version)) > 0),
  constraint ai_generation_logs_model_not_blank check (length(trim(model)) > 0),
  constraint ai_generation_logs_status_not_blank check (length(trim(status)) > 0)
);

create index if not exists ai_generation_logs_user_id_idx
on public.ai_generation_logs(user_id);

create index if not exists ai_generation_logs_group_id_idx
on public.ai_generation_logs(group_id);

create index if not exists ai_generation_logs_created_at_idx
on public.ai_generation_logs(created_at desc);

alter table public.ai_destinations enable row level security;
alter table public.ai_attractions enable row level security;
alter table public.ai_transport_tips enable row level security;
alter table public.ai_travel_documents enable row level security;
alter table public.ai_generation_logs enable row level security;

drop policy if exists "Authenticated users can read AI destinations" on public.ai_destinations;
create policy "Authenticated users can read AI destinations"
on public.ai_destinations for select
to authenticated
using (true);

drop policy if exists "Authenticated users can read AI attractions" on public.ai_attractions;
create policy "Authenticated users can read AI attractions"
on public.ai_attractions for select
to authenticated
using (true);

drop policy if exists "Authenticated users can read AI transport tips" on public.ai_transport_tips;
create policy "Authenticated users can read AI transport tips"
on public.ai_transport_tips for select
to authenticated
using (true);

drop policy if exists "Authenticated users can read AI travel documents" on public.ai_travel_documents;
create policy "Authenticated users can read AI travel documents"
on public.ai_travel_documents for select
to authenticated
using (true);

revoke all on public.ai_destinations from anon;
revoke all on public.ai_attractions from anon;
revoke all on public.ai_transport_tips from anon;
revoke all on public.ai_travel_documents from anon;
revoke all on public.ai_generation_logs from anon;

revoke all on public.ai_destinations from authenticated;
revoke all on public.ai_attractions from authenticated;
revoke all on public.ai_transport_tips from authenticated;
revoke all on public.ai_travel_documents from authenticated;
revoke all on public.ai_generation_logs from authenticated;

grant select on public.ai_destinations to authenticated;
grant select on public.ai_attractions to authenticated;
grant select on public.ai_transport_tips to authenticated;
grant select on public.ai_travel_documents to authenticated;

grant select, insert, update, delete on public.ai_destinations to service_role;
grant select, insert, update, delete on public.ai_attractions to service_role;
grant select, insert, update, delete on public.ai_transport_tips to service_role;
grant select, insert, update, delete on public.ai_travel_documents to service_role;
grant select, insert, update, delete on public.ai_generation_logs to service_role;

insert into public.ai_destinations (
  country_code, country_name, city_name, overview, best_months, language, currency
) values
  ('japan', 'Japão', 'Tokyo', 'Capital japonesa com bairros muito diferentes entre si: templos historicos em Asakusa, cultura pop em Akihabara, compras em Ginza e mirantes modernos.', 'Março a maio e outubro a novembro', 'Japonês', 'JPY'),
  ('japan', 'Japão', 'Kyoto', 'Antiga capital imperial, indicada para templos, jardins, santuarios, casas de cha e caminhadas por bairros historicos como Gion.', 'Março a maio e outubro a novembro', 'Japonês', 'JPY'),
  ('japan', 'Japão', 'Osaka', 'Cidade urbana e gastronomica, boa base para Dotonbori, mercados, castelo e conexoes rapidas com Kyoto e Nara.', 'Março a maio e outubro a novembro', 'Japonês', 'JPY'),
  ('italy', 'Itália', 'Roma', 'Cidade historica para combinar Coliseu, Forum Romano, Vaticano, pracas barrocas e bairros vivos como Trastevere.', 'Abril a junho e setembro a outubro', 'Italiano', 'EUR'),
  ('italy', 'Itália', 'Florença', 'Centro renascentista compacto, excelente para museus, Duomo, Ponte Vecchio e mirantes sobre o rio Arno.', 'Abril a junho e setembro a outubro', 'Italiano', 'EUR'),
  ('italy', 'Itália', 'Veneza', 'Cidade de canais, ilhas e arquitetura historica, melhor explorada a pe entre San Marco, Rialto e bairros menos cheios.', 'Abril a junho e setembro a outubro', 'Italiano', 'EUR'),
  ('italy', 'Itália', 'Milão', 'Capital de moda e design, com Duomo, galerias historicas, museus, opera e conexoes ferroviarias fortes.', 'Abril a junho e setembro a outubro', 'Italiano', 'EUR'),
  ('france', 'França', 'Paris', 'Capital francesa com museus, monumentos, bairros historicos, parques e boa malha de metro para organizar dias por regioes.', 'Abril a junho e setembro a outubro', 'Francês', 'EUR'),
  ('france', 'França', 'Nice', 'Base na Riviera Francesa com orla, cidade antiga, mercados, museus e conexoes costeiras para bate-voltas.', 'Maio a setembro', 'Francês', 'EUR'),
  ('switzerland', 'Suíça', 'Zurique', 'Maior cidade suica, boa para chegada, centro historico, lago, museus e trens para Lucerna ou Alpes.', 'Maio a setembro e dezembro a março', 'Alemão', 'CHF'),
  ('switzerland', 'Suíça', 'Lucerna', 'Cidade a beira do lago com pontes historicas, museus e acesso facil ao Monte Pilatus.', 'Maio a setembro e dezembro a março', 'Alemão', 'CHF'),
  ('switzerland', 'Suíça', 'Interlaken', 'Base alpina entre os lagos Thun e Brienz, usada para mirantes e conexoes com Jungfraujoch.', 'Junho a setembro e dezembro a março', 'Alemão', 'CHF'),
  ('switzerland', 'Suíça', 'Zermatt', 'Vila alpina sem carros a combustao, conhecida pelo Matterhorn, trens panoramicos e trilhas.', 'Junho a setembro e dezembro a março', 'Alemão', 'CHF'),
  ('brazil', 'Brasil', 'Rio de Janeiro', 'Cidade de praias, mirantes, floresta urbana, museus e bairros iconicos como Copacabana, Ipanema e Santa Teresa.', 'Abril a junho e setembro a novembro', 'Português', 'BRL'),
  ('brazil', 'Brasil', 'São Paulo', 'Maior metropole brasileira, com museus, gastronomia, parques, arquitetura, vida cultural e bairros diversos.', 'Março a junho e agosto a novembro', 'Português', 'BRL')
on conflict (country_code, city_name) do update
set
  country_name = excluded.country_name,
  overview = excluded.overview,
  best_months = excluded.best_months,
  language = excluded.language,
  currency = excluded.currency,
  updated_at = now();

insert into public.ai_attractions (
  country_code, country_name, city_name, name, category, description,
  suggested_duration_minutes, estimated_cost, currency, best_time_to_visit, official_url
) values
  ('japan', 'Japão', 'Tokyo', 'Senso-ji', 'templo', 'Templo budista historico em Asakusa, com Kaminarimon, Nakamise-dori e otimo contexto cultural.', 90, 0, 'JPY', 'Manhã', null),
  ('japan', 'Japão', 'Tokyo', 'Shibuya Crossing', 'bairro', 'Travessia famosa de Shibuya, combinavel com Hachiko, lojas e cafes da regiao.', 45, 0, 'JPY', 'Fim de tarde', null),
  ('japan', 'Japão', 'Tokyo', 'Meiji Jingu', 'santuario', 'Santuario xintoista em area arborizada perto de Harajuku, bom para uma pausa tranquila.', 90, 0, 'JPY', 'Manhã', null),
  ('japan', 'Japão', 'Tokyo', 'Tokyo Skytree', 'mirante', 'Torre com observatorios altos e centro comercial anexo, boa para vista panoramica.', 120, 2100, 'JPY', 'Fim de tarde', null),
  ('japan', 'Japão', 'Tokyo', 'Ueno Park', 'parque', 'Parque com museus, lago e flores de cerejeira na temporada.', 120, 0, 'JPY', 'Manhã', null),
  ('japan', 'Japão', 'Tokyo', 'Akihabara', 'bairro', 'Bairro de eletronicos, anime, games e lojas especializadas.', 120, 0, 'JPY', 'Tarde', null),
  ('japan', 'Japão', 'Tokyo', 'Tsukiji Outer Market', 'mercado', 'Mercado externo com comidas, lojas e degustacoes, melhor cedo.', 90, 2500, 'JPY', 'Manhã', null),
  ('japan', 'Japão', 'Tokyo', 'Imperial Palace East Gardens', 'jardim', 'Jardins publicos do Palacio Imperial, bons para caminhada historica.', 90, 0, 'JPY', 'Manhã', null),
  ('japan', 'Japão', 'Tokyo', 'Ginza', 'bairro', 'Area de lojas, gastronomia e arquitetura comercial no centro de Tokyo.', 90, 0, 'JPY', 'Tarde', null),
  ('japan', 'Japão', 'Tokyo', 'teamLab Planets', 'museu imersivo', 'Experiencia digital imersiva em Toyosu; exige reserva com antecedencia em muitos periodos.', 120, 3800, 'JPY', 'Tarde', null),
  ('japan', 'Japão', 'Kyoto', 'Fushimi Inari Taisha', 'santuario', 'Santuario famoso pelos milhares de torii vermelhos em trilhas pela montanha.', 150, 0, 'JPY', 'Manhã cedo', null),
  ('japan', 'Japão', 'Kyoto', 'Kiyomizu-dera', 'templo', 'Templo historico com varanda de madeira e ruas tradicionais ao redor.', 120, 500, 'JPY', 'Manhã', null),
  ('japan', 'Japão', 'Kyoto', 'Arashiyama Bamboo Grove', 'parque', 'Bosque de bambu em Arashiyama, combinavel com Tenryu-ji e ponte Togetsukyo.', 90, 0, 'JPY', 'Manhã cedo', null),
  ('japan', 'Japão', 'Kyoto', 'Kinkaku-ji', 'templo', 'Pavilhao Dourado cercado por jardim e lago, uma das visitas classicas de Kyoto.', 75, 500, 'JPY', 'Manhã', null),
  ('japan', 'Japão', 'Kyoto', 'Nishiki Market', 'mercado', 'Rua de mercado com comidas, utensilios e ingredientes locais.', 90, 2500, 'JPY', 'Almoço', null),
  ('japan', 'Japão', 'Kyoto', 'Gion', 'bairro', 'Bairro historico de casas de cha, ruelas preservadas e atmosfera tradicional.', 90, 0, 'JPY', 'Fim de tarde', null),
  ('japan', 'Japão', 'Osaka', 'Osaka Castle', 'castelo', 'Castelo reconstruido em parque amplo, com museu e vista da cidade.', 120, 600, 'JPY', 'Manhã', null),
  ('japan', 'Japão', 'Osaka', 'Dotonbori', 'bairro', 'Regiao noturna de neon, canais e comida de rua como takoyaki e okonomiyaki.', 120, 2500, 'JPY', 'Noite', null),
  ('japan', 'Japão', 'Osaka', 'Kuromon Ichiba Market', 'mercado', 'Mercado coberto conhecido por frutos do mar, snacks e barracas.', 90, 3000, 'JPY', 'Manhã', null),
  ('japan', 'Japão', 'Osaka', 'Universal Studios Japan', 'parque tematico', 'Parque tematico grande em Osaka, exige dia dedicado e compra antecipada em datas cheias.', 480, 8600, 'JPY', 'Dia inteiro', null),
  ('japan', 'Japão', 'Osaka', 'Umeda Sky Building', 'mirante', 'Mirante urbano com vista de Osaka, bom para fim de tarde.', 90, 2000, 'JPY', 'Fim de tarde', null),
  ('japan', 'Japão', 'Osaka', 'Shitenno-ji', 'templo', 'Um dos templos budistas mais antigos do Japao, com pagode e jardim.', 90, 300, 'JPY', 'Manhã', null),

  ('italy', 'Itália', 'Roma', 'Coliseu', 'sitio historico', 'Anfiteatro romano essencial; combine com Forum Romano e Palatino por proximidade.', 120, 18, 'EUR', 'Manhã', null),
  ('italy', 'Itália', 'Roma', 'Fórum Romano', 'sitio historico', 'Area arqueologica do centro politico da Roma antiga.', 120, 18, 'EUR', 'Manhã', null),
  ('italy', 'Itália', 'Roma', 'Palatino', 'sitio historico', 'Colina arqueologica ligada as origens de Roma, junto ao Forum Romano.', 90, 18, 'EUR', 'Manhã', null),
  ('italy', 'Itália', 'Roma', 'Fontana di Trevi', 'monumento', 'Fonte barroca muito visitada, melhor cedo ou a noite para menos lotacao.', 30, 0, 'EUR', 'Manhã cedo', null),
  ('italy', 'Itália', 'Roma', 'Pantheon', 'monumento', 'Templo romano preservado com cupula monumental, perto de Piazza Navona.', 60, 5, 'EUR', 'Manhã', null),
  ('italy', 'Itália', 'Roma', 'Piazza Navona', 'praca', 'Praca barroca com fontes e artistas de rua, boa para caminhar no centro historico.', 45, 0, 'EUR', 'Fim de tarde', null),
  ('italy', 'Itália', 'Roma', 'Vaticano', 'bairro/estado', 'Area de Sao Pedro e arredores; combine com Basilica e Museus Vaticanos conforme reserva.', 120, 0, 'EUR', 'Manhã', null),
  ('italy', 'Itália', 'Roma', 'Museus Vaticanos', 'museu', 'Colecao extensa que inclui a Capela Sistina; reserva antecipada e altamente recomendada.', 180, 20, 'EUR', 'Manhã', null),
  ('italy', 'Itália', 'Roma', 'Trastevere', 'bairro', 'Bairro de ruas estreitas, restaurantes e vida noturna leve.', 120, 0, 'EUR', 'Noite', null),
  ('italy', 'Itália', 'Roma', 'Piazza Venezia', 'praca', 'Praca central perto do Vittoriano, util para conectar roteiros pelo centro.', 45, 0, 'EUR', 'Tarde', null),
  ('italy', 'Itália', 'Florença', 'Galleria degli Uffizi', 'museu', 'Museu renascentista com Botticelli, Leonardo e Caravaggio; exige reserva em alta temporada.', 180, 25, 'EUR', 'Manhã', null),
  ('italy', 'Itália', 'Florença', 'Ponte Vecchio', 'ponte', 'Ponte historica sobre o Arno, conhecida pelas lojas e pela vista do rio.', 45, 0, 'EUR', 'Fim de tarde', null),
  ('italy', 'Itália', 'Florença', 'Duomo di Firenze', 'igreja', 'Catedral de Santa Maria del Fiore, com cupula de Brunelleschi e batisterio proximo.', 120, 20, 'EUR', 'Manhã', null),
  ('italy', 'Itália', 'Florença', 'Galleria dell''Accademia', 'museu', 'Museu do David de Michelangelo; reserve horario para evitar filas longas.', 90, 16, 'EUR', 'Manhã', null),
  ('italy', 'Itália', 'Florença', 'Piazzale Michelangelo', 'mirante', 'Mirante classico para ver Florença e o rio Arno ao por do sol.', 60, 0, 'EUR', 'Fim de tarde', null),
  ('italy', 'Itália', 'Florença', 'Palazzo Pitti', 'palacio', 'Palacio com galerias e acesso aos Jardins de Boboli.', 150, 16, 'EUR', 'Tarde', null),
  ('italy', 'Itália', 'Veneza', 'Basilica di San Marco', 'igreja', 'Basilica de mosaicos dourados na Piazza San Marco; chegue cedo ou reserve.', 90, 6, 'EUR', 'Manhã', null),
  ('italy', 'Itália', 'Veneza', 'Palazzo Ducale', 'palacio', 'Antiga sede do poder veneziano, com saloes historicos e Ponte dos Suspiros.', 150, 30, 'EUR', 'Manhã', null),
  ('italy', 'Itália', 'Veneza', 'Ponte di Rialto', 'ponte', 'Ponte iconica sobre o Grande Canal, com mercado e lojas nas proximidades.', 45, 0, 'EUR', 'Manhã', null),
  ('italy', 'Itália', 'Veneza', 'Grande Canal', 'canal', 'Eixo principal de Veneza, ideal para vaporetto ou passeio de gondola revisado por custo.', 60, 9.5, 'EUR', 'Fim de tarde', null),
  ('italy', 'Itália', 'Veneza', 'Murano', 'ilha', 'Ilha conhecida pela tradicao do vidro, boa para meio dia.', 180, 20, 'EUR', 'Manhã', null),
  ('italy', 'Itália', 'Veneza', 'Burano', 'ilha', 'Ilha de casas coloridas e rendas, combinavel com Murano em dia tranquilo.', 180, 20, 'EUR', 'Tarde', null),
  ('italy', 'Itália', 'Milão', 'Duomo di Milano', 'igreja', 'Catedral gotica de Milao, com terracos pagos e vista central.', 120, 15, 'EUR', 'Manhã', null),
  ('italy', 'Itália', 'Milão', 'Galleria Vittorio Emanuele II', 'galeria', 'Galeria historica de lojas e cafes ao lado do Duomo.', 45, 0, 'EUR', 'Manhã', null),
  ('italy', 'Itália', 'Milão', 'Teatro alla Scala', 'teatro', 'Teatro de opera historico com museu visitavel conforme agenda.', 75, 12, 'EUR', 'Tarde', null),
  ('italy', 'Itália', 'Milão', 'Castello Sforzesco', 'castelo', 'Castelo com museus e acesso ao Parco Sempione.', 120, 5, 'EUR', 'Tarde', null),
  ('italy', 'Itália', 'Milão', 'Santa Maria delle Grazie', 'igreja/museu', 'Igreja ligada a A Ultima Ceia; visita exige reserva antecipada.', 60, 15, 'EUR', 'Manhã', null),
  ('italy', 'Itália', 'Milão', 'Brera', 'bairro', 'Bairro de galerias, restaurantes e ruas boas para caminhar.', 90, 0, 'EUR', 'Fim de tarde', null),

  ('france', 'França', 'Paris', 'Torre Eiffel', 'monumento', 'Marco de Paris com jardins e mirantes pagos; reserve se quiser subir.', 120, 29, 'EUR', 'Fim de tarde', null),
  ('france', 'França', 'Paris', 'Museu do Louvre', 'museu', 'Museu enorme com obras como Mona Lisa e Vitoria de Samotracia; exige recorte de alas.', 180, 22, 'EUR', 'Manhã', null),
  ('france', 'França', 'Paris', 'Notre-Dame', 'igreja', 'Catedral na Ile de la Cite, combinavel com Sainte-Chapelle e margens do Sena.', 60, 0, 'EUR', 'Manhã', null),
  ('france', 'França', 'Paris', 'Montmartre', 'bairro', 'Bairro em colina com ruas, artistas, cafes e acesso ao Sacre-Coeur.', 120, 0, 'EUR', 'Fim de tarde', null),
  ('france', 'França', 'Paris', 'Sacré-Cœur', 'igreja', 'Basilica no alto de Montmartre com vista ampla de Paris.', 60, 0, 'EUR', 'Manhã', null),
  ('france', 'França', 'Paris', 'Arco do Triunfo', 'monumento', 'Monumento na Etoile, com mirante pago e vista da Champs-Elysees.', 75, 16, 'EUR', 'Fim de tarde', null),
  ('france', 'França', 'Paris', 'Champs-Élysées', 'avenida', 'Avenida classica entre Concorde e Arco do Triunfo, melhor como caminhada curta.', 60, 0, 'EUR', 'Tarde', null),
  ('france', 'França', 'Paris', 'Musée d''Orsay', 'museu', 'Museu em antiga estacao, forte em impressionismo e pos-impressionismo.', 150, 16, 'EUR', 'Manhã', null),
  ('france', 'França', 'Paris', 'Sainte-Chapelle', 'igreja', 'Capela gotica conhecida pelos vitrais, perto da Conciergerie.', 60, 13, 'EUR', 'Manhã', null),
  ('france', 'França', 'Paris', 'Jardim de Luxemburgo', 'parque', 'Parque classico para pausa entre Saint-Germain e Quartier Latin.', 60, 0, 'EUR', 'Tarde', null),
  ('france', 'França', 'Nice', 'Promenade des Anglais', 'orla', 'Calçada a beira-mar mais conhecida de Nice, boa para caminhar no fim do dia.', 90, 0, 'EUR', 'Fim de tarde', null),
  ('france', 'França', 'Nice', 'Vieux Nice', 'bairro', 'Cidade antiga com ruas estreitas, lojas, cafes e acesso ao mercado.', 120, 0, 'EUR', 'Manhã', null),
  ('france', 'França', 'Nice', 'Colline du Château', 'mirante', 'Parque e mirante com vista para a Baie des Anges e cidade antiga.', 90, 0, 'EUR', 'Manhã', null),
  ('france', 'França', 'Nice', 'Musée Matisse', 'museu', 'Museu dedicado a Henri Matisse no bairro de Cimiez.', 90, 10, 'EUR', 'Tarde', null),
  ('france', 'França', 'Nice', 'Marché Cours Saleya', 'mercado', 'Mercado de flores e alimentos no centro antigo, melhor pela manha.', 60, 15, 'EUR', 'Manhã', null),
  ('france', 'França', 'Nice', 'Place Masséna', 'praca', 'Praca central entre avenida comercial, jardins e cidade antiga.', 45, 0, 'EUR', 'Tarde', null),

  ('switzerland', 'Suíça', 'Zurique', 'Altstadt Zurich', 'centro historico', 'Centro antigo de Zurique com ruelas, igrejas e margens do rio Limmat.', 120, 0, 'CHF', 'Manhã', null),
  ('switzerland', 'Suíça', 'Zurique', 'Lake Zurich', 'lago', 'Orla do Lago de Zurique, boa para caminhada, barco ou pausa ao ar livre.', 90, 0, 'CHF', 'Fim de tarde', null),
  ('switzerland', 'Suíça', 'Zurique', 'Kunsthaus Zurich', 'museu', 'Museu de arte importante da cidade, com colecao europeia e moderna.', 120, 23, 'CHF', 'Tarde', null),
  ('switzerland', 'Suíça', 'Zurique', 'Uetliberg', 'mirante', 'Montanha local com vista para Zurique e Alpes em dias claros.', 180, 18, 'CHF', 'Manhã', null),
  ('switzerland', 'Suíça', 'Zurique', 'Bahnhofstrasse', 'avenida', 'Rua comercial central, util para caminhar entre estacao e lago.', 60, 0, 'CHF', 'Tarde', null),
  ('switzerland', 'Suíça', 'Lucerna', 'Kapellbrücke', 'ponte', 'Ponte da Capela, simbolo de Lucerna, com torre e pinturas historicas.', 45, 0, 'CHF', 'Manhã', null),
  ('switzerland', 'Suíça', 'Lucerna', 'Lion Monument', 'monumento', 'Monumento do Leao esculpido na rocha, proximo ao centro.', 30, 0, 'CHF', 'Manhã', null),
  ('switzerland', 'Suíça', 'Lucerna', 'Mount Pilatus', 'montanha', 'Passeio alpino classico por teleferico ou trem de cremalheira conforme temporada.', 300, 78, 'CHF', 'Dia claro', null),
  ('switzerland', 'Suíça', 'Lucerna', 'Swiss Museum of Transport', 'museu', 'Museu grande sobre transportes, bom para dia chuvoso ou familias.', 180, 35, 'CHF', 'Tarde', null),
  ('switzerland', 'Suíça', 'Interlaken', 'Harder Kulm', 'mirante', 'Mirante acima de Interlaken, acessado por funicular em temporada.', 120, 40, 'CHF', 'Fim de tarde', null),
  ('switzerland', 'Suíça', 'Interlaken', 'Lake Thun', 'lago', 'Lago a oeste de Interlaken, bom para barco, castelos e paisagens.', 180, 35, 'CHF', 'Tarde', null),
  ('switzerland', 'Suíça', 'Interlaken', 'Lake Brienz', 'lago', 'Lago de agua azul clara, com passeios de barco e conexao para vilas proximas.', 180, 35, 'CHF', 'Tarde', null),
  ('switzerland', 'Suíça', 'Interlaken', 'Jungfraujoch', 'montanha', 'Passeio alpino de trem para a regiao de alta montanha; caro e dependente do clima.', 420, 220, 'CHF', 'Dia claro', null),
  ('switzerland', 'Suíça', 'Zermatt', 'Matterhorn', 'montanha', 'Montanha simbolo de Zermatt, vista de trilhas e mirantes.', 120, 0, 'CHF', 'Dia claro', null),
  ('switzerland', 'Suíça', 'Zermatt', 'Gornergrat Railway', 'trem panoramico', 'Trem de montanha para vista do Matterhorn e geleiras.', 240, 126, 'CHF', 'Manhã clara', null),
  ('switzerland', 'Suíça', 'Zermatt', 'Matterhorn Museum', 'museu', 'Museu pequeno sobre historia alpina e alpinismo em Zermatt.', 75, 12, 'CHF', 'Tarde', null),
  ('switzerland', 'Suíça', 'Zermatt', 'Sunnegga', 'mirante', 'Area de montanha acessada por funicular, com trilhas e vista para o Matterhorn.', 180, 30, 'CHF', 'Manhã', null),

  ('brazil', 'Brasil', 'Rio de Janeiro', 'Cristo Redentor', 'monumento', 'Monumento no Corcovado com vista ampla do Rio; compre ingresso conforme acesso escolhido.', 180, 97, 'BRL', 'Manhã clara', null),
  ('brazil', 'Brasil', 'Rio de Janeiro', 'Pão de Açúcar', 'mirante', 'Bondinho com vistas para baia, praias e cidade; bom no fim de tarde.', 180, 185, 'BRL', 'Fim de tarde', null),
  ('brazil', 'Brasil', 'Rio de Janeiro', 'Copacabana', 'praia', 'Praia urbana classica com calçada, quiosques e hoteis historicos.', 120, 0, 'BRL', 'Manhã', null),
  ('brazil', 'Brasil', 'Rio de Janeiro', 'Ipanema', 'praia', 'Praia e bairro com comercio, bares e vista para o Morro Dois Irmaos.', 120, 0, 'BRL', 'Fim de tarde', null),
  ('brazil', 'Brasil', 'Rio de Janeiro', 'Jardim Botânico do Rio de Janeiro', 'jardim', 'Jardim historico com palmeiras imperiais, estufas e trilhas leves.', 120, 75, 'BRL', 'Manhã', null),
  ('brazil', 'Brasil', 'Rio de Janeiro', 'Museu do Amanhã', 'museu', 'Museu de ciencia na zona portuaria, combinavel com Boulevard Olimpico.', 120, 30, 'BRL', 'Tarde', null),
  ('brazil', 'Brasil', 'Rio de Janeiro', 'Escadaria Selarón', 'monumento', 'Escadaria de azulejos entre Santa Teresa e Lapa, boa para visita curta.', 45, 0, 'BRL', 'Manhã', null),
  ('brazil', 'Brasil', 'São Paulo', 'Avenida Paulista', 'avenida', 'Eixo cultural e comercial com museus, livrarias, centros culturais e metro.', 120, 0, 'BRL', 'Tarde', null),
  ('brazil', 'Brasil', 'São Paulo', 'MASP', 'museu', 'Museu de arte com acervo importante e vao livre na Paulista.', 120, 70, 'BRL', 'Tarde', null),
  ('brazil', 'Brasil', 'São Paulo', 'Parque Ibirapuera', 'parque', 'Grande parque urbano com museus, lago, pistas e arquitetura modernista.', 150, 0, 'BRL', 'Manhã', null),
  ('brazil', 'Brasil', 'São Paulo', 'Mercado Municipal de São Paulo', 'mercado', 'Mercadao historico conhecido por sanduiches, frutas e arquitetura.', 90, 60, 'BRL', 'Almoço', null),
  ('brazil', 'Brasil', 'São Paulo', 'Liberdade', 'bairro', 'Bairro de influencia japonesa, com lojas, restaurantes e feira em fins de semana.', 120, 0, 'BRL', 'Tarde', null),
  ('brazil', 'Brasil', 'São Paulo', 'Pinacoteca de São Paulo', 'museu', 'Museu de arte brasileira perto da Luz, com predio historico.', 120, 30, 'BRL', 'Manhã', null),
  ('brazil', 'Brasil', 'São Paulo', 'Beco do Batman', 'arte urbana', 'Area de grafites na Vila Madalena, combinavel com cafes e lojas.', 60, 0, 'BRL', 'Tarde', null)
on conflict (country_code, city_name, name) do update
set
  country_name = excluded.country_name,
  category = excluded.category,
  description = excluded.description,
  suggested_duration_minutes = excluded.suggested_duration_minutes,
  estimated_cost = excluded.estimated_cost,
  currency = excluded.currency,
  best_time_to_visit = excluded.best_time_to_visit,
  official_url = excluded.official_url,
  updated_at = now();

insert into public.ai_transport_tips (
  country_code, city_from, city_to, transport_type, duration_text, description, estimated_cost, currency
) values
  ('japan', 'Aeroporto de Haneda', 'Shinjuku', 'trem/metro', '40 a 55 min', 'Use Keikyu ou Monorail + JR/metro conforme hospedagem; evite taxi em horario de pico.', 700, 'JPY'),
  ('japan', 'Aeroporto de Narita', 'Tokyo Station', 'trem expresso', '55 a 70 min', 'Narita Express ou Keisei Skyliner conectam o aeroporto ao centro com reserva simples.', 3070, 'JPY'),
  ('japan', 'Tokyo', 'Kyoto', 'shinkansen', '2h10 a 2h30', 'Tokaido Shinkansen liga Tokyo a Kyoto; reserve assento em datas cheias.', 14000, 'JPY'),
  ('japan', 'Kyoto', 'Osaka', 'trem', '15 a 45 min', 'JR, Hankyu ou Keihan conectam Kyoto e Osaka; escolha pela localizacao do hotel.', 600, 'JPY'),
  ('italy', 'Roma', 'Florença', 'trem', '1h30 a 1h40', 'Trens de alta velocidade conectam Roma Termini a Firenze Santa Maria Novella.', 35, 'EUR'),
  ('italy', 'Florença', 'Veneza', 'trem', '2h a 2h15', 'Alta velocidade liga Florença a Venezia Santa Lucia; compre antecipado para melhores tarifas.', 40, 'EUR'),
  ('italy', 'Veneza', 'Milão', 'trem', '2h15 a 2h30', 'Trecho comum em alta velocidade entre Venezia Santa Lucia e Milano Centrale.', 35, 'EUR'),
  ('france', 'Aeroporto Charles de Gaulle', 'Paris', 'trem RER/taxi', '35 a 60 min', 'RER B chega ao centro; taxi oficial pode valer com bagagem ou chegada noturna.', 12, 'EUR'),
  ('france', 'Paris', 'Nice', 'trem/voo', '5h40 de trem ou 1h30 de voo', 'TGV liga Paris a Nice; voo reduz tempo bruto, mas considere deslocamento de aeroporto.', 80, 'EUR'),
  ('switzerland', 'Aeroporto de Zurique', 'Zurique HB', 'trem', '10 a 15 min', 'Trens frequentes ligam o aeroporto a Zurich HB.', 7, 'CHF'),
  ('switzerland', 'Zurique', 'Lucerna', 'trem', '45 a 55 min', 'Trecho direto e frequente, bom para bate-volta ou mudanca de base.', 26, 'CHF'),
  ('switzerland', 'Lucerna', 'Interlaken', 'trem panoramico', '1h50 a 2h', 'Linha Luzern-Interlaken Express tem paisagens alpinas; reserve assento se desejar conforto.', 35, 'CHF'),
  ('switzerland', 'Interlaken', 'Zermatt', 'trem', '2h15 a 2h45', 'Conexao via Spiez/Visp ate Zermatt; confira baldeacoes e clima.', 70, 'CHF'),
  ('brazil', 'Aeroporto Santos Dumont', 'Copacabana', 'taxi/app/metro', '25 a 45 min', 'Taxi/app e metro sao opcoes; tempo varia bastante conforme transito.', 55, 'BRL'),
  ('brazil', 'São Paulo', 'Rio de Janeiro', 'aviao/onibus', '1h de voo ou 6h de onibus', 'Aviao e mais rapido entre aeroportos; onibus pode ser economico em viagem flexivel.', 300, 'BRL')
on conflict (country_code, city_from, city_to, transport_type) do update
set
  duration_text = excluded.duration_text,
  description = excluded.description,
  estimated_cost = excluded.estimated_cost,
  currency = excluded.currency;

insert into public.ai_travel_documents (
  country_code, country_name, document_name, description, required
) values
  ('japan', 'Japão', 'Passaporte', 'Leve passaporte valido e verifique a exigencia atual de validade antes da viagem.', true),
  ('japan', 'Japão', 'Seguro viagem', 'Recomendado para cobertura medica, bagagem e imprevistos; confirme cobertura internacional.', false),
  ('japan', 'Japão', 'Reserva de hospedagem', 'Mantenha comprovantes de hospedagem e contatos dos hoteis ou acomodacoes.', false),
  ('japan', 'Japão', 'Comprovantes financeiros', 'Tenha comprovantes se solicitados na entrada; verifique exigencias atuais antes da viagem.', false),
  ('japan', 'Japão', 'Chip/eSIM internacional', 'Item pratico para mapas, traducao e reservas durante a viagem.', false),
  ('japan', 'Japão', 'Cartao IC/Suica', 'Checklist util para transporte urbano; disponibilidade fisica pode variar, verifique opcoes digitais.', false),
  ('italy', 'Itália', 'Passaporte', 'Leve passaporte valido para area Schengen e verifique validade exigida antes da viagem.', true),
  ('italy', 'Itália', 'Seguro viagem', 'Seguro com cobertura medica internacional e recomendado/exigido conforme regra vigente; verifique antes de viajar.', true),
  ('italy', 'Itália', 'Comprovante de hospedagem', 'Mantenha reservas de hotel ou carta-convite disponiveis.', false),
  ('italy', 'Itália', 'Passagem de retorno', 'Pode ser solicitada na entrada; mantenha passagem de saida do espaco Schengen.', false),
  ('italy', 'Itália', 'Comprovante financeiro', 'Tenha meios de comprovar recursos para a estadia quando solicitado.', false),
  ('italy', 'Itália', 'ETIAS', 'A exigencia pode mudar conforme calendario europeu; verifique a regra atual antes da viagem.', false),
  ('france', 'França', 'Passaporte', 'Leve passaporte valido para area Schengen e verifique validade exigida antes da viagem.', true),
  ('france', 'França', 'Seguro viagem', 'Seguro com cobertura medica internacional e recomendado/exigido conforme regra vigente; verifique antes de viajar.', true),
  ('france', 'França', 'Comprovante de hospedagem', 'Mantenha reservas de hotel ou carta-convite disponiveis.', false),
  ('france', 'França', 'Passagem de retorno', 'Pode ser solicitada na entrada; mantenha passagem de saida do espaco Schengen.', false),
  ('france', 'França', 'Comprovante financeiro', 'Tenha meios de comprovar recursos para a estadia quando solicitado.', false),
  ('france', 'França', 'ETIAS', 'A exigencia pode mudar conforme calendario europeu; verifique a regra atual antes da viagem.', false),
  ('switzerland', 'Suíça', 'Passaporte', 'Leve passaporte valido para area Schengen/Suica e verifique validade exigida antes da viagem.', true),
  ('switzerland', 'Suíça', 'Seguro viagem', 'Seguro com cobertura medica internacional e recomendado/exigido conforme regra vigente; verifique antes de viajar.', true),
  ('switzerland', 'Suíça', 'Comprovante de hospedagem', 'Mantenha reservas de hotel ou carta-convite disponiveis.', false),
  ('switzerland', 'Suíça', 'Passagem de retorno', 'Pode ser solicitada na entrada; mantenha passagem de saida do espaco Schengen.', false),
  ('switzerland', 'Suíça', 'Comprovante financeiro', 'Tenha meios de comprovar recursos para a estadia quando solicitado.', false),
  ('switzerland', 'Suíça', 'Swiss Travel Pass ou bilhetes', 'Nao e documento legal, mas pode entrar no checklist se usar muitos trens.', false),
  ('brazil', 'Brasil', 'Documento oficial com foto', 'Para brasileiros, leve RG/CNH em bom estado; estrangeiros devem verificar passaporte/visto aplicavel.', true),
  ('brazil', 'Brasil', 'Seguro viagem nacional', 'Opcional, mas util para cobertura medica, cancelamentos e bagagem.', false),
  ('brazil', 'Brasil', 'Reservas de hospedagem', 'Mantenha comprovantes de hospedagem e contatos para check-in.', false),
  ('brazil', 'Brasil', 'Cartao de transporte ou apps locais', 'Checklist pratico para metro, onibus, taxi/app e mapas.', false)
on conflict (country_code, document_name) do update
set
  country_name = excluded.country_name,
  description = excluded.description,
  required = excluded.required;
