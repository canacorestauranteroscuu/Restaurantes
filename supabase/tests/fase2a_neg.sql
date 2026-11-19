-- Casos que el review marcó. Cada uno fallaba con el esquema anterior.
\set ON_ERROR_STOP on

-- L2: el default privilege de anon no sobrevive el REVOKE.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.aprobar_renovacion(uuid,date,numeric,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rechazar_renovacion(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.calcular_monto_esperado(uuid,date,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon conserva EXECUTE en un wrapper';
  END IF;
  IF has_sequence_privilege('anon', 'public.auditoria_id_seq', 'USAGE')
     OR has_sequence_privilege('authenticated', 'public.auditoria_id_seq', 'USAGE') THEN
    RAISE EXCEPTION 'anon o authenticated conservan USAGE de auditoria_id_seq';
  END IF;
  IF has_table_privilege('service_role', 'public.auditoria', 'TRUNCATE') THEN
    RAISE EXCEPTION 'service_role conserva TRUNCATE en auditoria';
  END IF;
END $$;

-- L6: solo el nombre. La cuenta no se reescribe.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', false);
UPDATE public.socios
SET nombre = 'Fonda Sintetica A'
WHERE id = '10000000-0000-4000-8000-000000000001';
DO $$
BEGIN
  UPDATE public.socios
  SET created_at = '2000-01-01'
  WHERE id = '10000000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'el socio reescribio created_at';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;
DO $$
BEGIN
  UPDATE public.cuentas_socio
  SET id = gen_random_uuid()
  WHERE user_id = '00000000-0000-4000-8000-0000000000a1';
  RAISE EXCEPTION 'el socio reescribio su cuenta';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;
RESET ROLE;

-- H1: tesorero que también es socio de una ficha.
INSERT INTO public.socios (id, nombre, es_socio_base)
VALUES ('10000000-0000-4000-8000-000000000009', 'Fonda del Tesorero', false);
INSERT INTO public.usuario_roles (user_id, rol)
VALUES ('00000000-0000-4000-8000-0000000000b1', 'socio');
INSERT INTO public.cuentas_socio (socio_id, user_id)
VALUES (
  '10000000-0000-4000-8000-000000000009',
  '00000000-0000-4000-8000-0000000000b1'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b1', false);
INSERT INTO public.renovaciones (id, socio_id, anio, fecha_pago, monto_reportado)
VALUES (
  '20000000-0000-4000-8000-000000000091',
  '10000000-0000-4000-8000-000000000009',
  2027,
  DATE '2027-01-10',
  1200
);
DO $$
BEGIN
  PERFORM public.aprobar_renovacion('20000000-0000-4000-8000-000000000091');
  RAISE EXCEPTION 'aprobo su propio pago';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%propia renovacion%' THEN
      RAISE;
    END IF;
END $$;
DO $$
BEGIN
  PERFORM public.rechazar_renovacion('20000000-0000-4000-8000-000000000091', 'no');
  RAISE EXCEPTION 'rechazo su propio pago';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%propia renovacion%' THEN
      RAISE;
    END IF;
END $$;
RESET ROLE;

-- M2: el tipo lo pone el servidor. Base, o un año ya aprobado, nunca es alta.
DO $$
DECLARE
  t text;
BEGIN
  SELECT tipo INTO t FROM public.renovaciones WHERE id = '20000000-0000-4000-8000-000000000020';
  IF t <> 'renovacion' THEN
    RAISE EXCEPTION 'socio base quedo como %', t;
  END IF;
END $$;

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-0000000000c0', 'historial@example.test');
INSERT INTO public.usuario_roles (user_id, rol)
VALUES ('00000000-0000-4000-8000-0000000000c0', 'socio');
INSERT INTO public.socios (id, nombre, es_socio_base)
VALUES ('10000000-0000-4000-8000-000000000008', 'Fonda Con Historial', false);
INSERT INTO public.cuentas_socio (socio_id, user_id)
VALUES (
  '10000000-0000-4000-8000-000000000008',
  '00000000-0000-4000-8000-0000000000c0'
);
INSERT INTO public.membresias (socio_id, anio, estado)
VALUES ('10000000-0000-4000-8000-000000000008', 2026, 'activa');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c0', false);
INSERT INTO public.renovaciones (id, socio_id, anio, fecha_pago, monto_reportado)
VALUES (
  '20000000-0000-4000-8000-000000000081',
  '10000000-0000-4000-8000-000000000008',
  2027,
  DATE '2026-12-20',
  1200
);
RESET ROLE;

DO $$
DECLARE
  t text;
  got numeric;
BEGIN
  SELECT tipo INTO t FROM public.renovaciones WHERE id = '20000000-0000-4000-8000-000000000081';
  IF t <> 'renovacion' THEN
    RAISE EXCEPTION 'con año previo quedo como %', t;
  END IF;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b1', true);
  got := public.calcular_monto_esperado(
    '10000000-0000-4000-8000-000000000008',
    DATE '2026-12-20',
    2027
  );
  IF got <> 1200 THEN
    RAISE EXCEPTION 'pago de dic 2026 para 2027 debio ser 1200, fue %', got;
  END IF;
END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b1', false);
SELECT public.aprobar_renovacion('20000000-0000-4000-8000-000000000081');
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.membresias
    WHERE socio_id = '10000000-0000-4000-8000-000000000008'
      AND anio = 2027
      AND estado = 'activa'
  ) THEN
    RAISE EXCEPTION 'la membresia 2027 no quedo activa';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.auditoria
    WHERE renovacion_id = '20000000-0000-4000-8000-000000000081'
      AND accion = 'cambio_monto'
  ) THEN
    RAISE EXCEPTION 'un pago exacto no debe auditar cambio de monto';
  END IF;
END $$;
RESET ROLE;

-- M1: lo reportado distinto del monto final exige motivo y auditoría.
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-0000000000c5', 'bajo@example.test');
INSERT INTO public.usuario_roles (user_id, rol)
VALUES ('00000000-0000-4000-8000-0000000000c5', 'socio');
INSERT INTO public.socios (id, nombre)
VALUES ('10000000-0000-4000-8000-000000000007', 'Fonda Pago Corto');
INSERT INTO public.cuentas_socio (socio_id, user_id)
VALUES (
  '10000000-0000-4000-8000-000000000007',
  '00000000-0000-4000-8000-0000000000c5'
);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c5', false);
INSERT INTO public.renovaciones (id, socio_id, anio, fecha_pago, monto_reportado)
VALUES (
  '20000000-0000-4000-8000-000000000071',
  '10000000-0000-4000-8000-000000000007',
  2027,
  DATE '2027-12-31',
  5
);
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b1', false);
DO $$
BEGIN
  PERFORM public.aprobar_renovacion('20000000-0000-4000-8000-000000000071');
  RAISE EXCEPTION 'aprobo un pago de 5 contra cuota de 100';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%requiere motivo%' THEN
      RAISE;
    END IF;
END $$;
SELECT public.aprobar_renovacion(
  '20000000-0000-4000-8000-000000000071',
  NULL,
  NULL,
  'el socio reporto 5 y la cuota de diciembre es 100'
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.renovaciones
    WHERE id = '20000000-0000-4000-8000-000000000071'
      AND estado = 'aprobada'
      AND monto_esperado = 100
  ) THEN
    RAISE EXCEPTION 'el pago corto no quedo en 100';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.auditoria
    WHERE renovacion_id = '20000000-0000-4000-8000-000000000071'
      AND accion = 'cambio_monto'
  ) THEN
    RAISE EXCEPTION 'falta auditoria de la diferencia';
  END IF;
END $$;
RESET ROLE;

-- M2: mover la fecha y con eso la cuota exige motivo.
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-0000000000c6', 'fecha@example.test');
INSERT INTO public.usuario_roles (user_id, rol)
VALUES ('00000000-0000-4000-8000-0000000000c6', 'socio');
INSERT INTO public.socios (id, nombre)
VALUES ('10000000-0000-4000-8000-000000000006', 'Fonda Fecha');
INSERT INTO public.cuentas_socio (socio_id, user_id)
VALUES (
  '10000000-0000-4000-8000-000000000006',
  '00000000-0000-4000-8000-0000000000c6'
);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c6', false);
INSERT INTO public.renovaciones (id, socio_id, anio, fecha_pago, monto_reportado)
VALUES (
  '20000000-0000-4000-8000-000000000061',
  '10000000-0000-4000-8000-000000000006',
  2027,
  DATE '2027-03-01',
  1000
);
INSERT INTO storage.objects (bucket_id, name)
VALUES (
  'comprobantes',
  '10000000-0000-4000-8000-000000000006/20000000-0000-4000-8000-000000000061/c.pdf'
);
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b1', false);
DO $$
BEGIN
  PERFORM public.aprobar_renovacion(
    '20000000-0000-4000-8000-000000000061',
    DATE '2027-12-01',
    NULL,
    NULL
  );
  RAISE EXCEPTION 'movio marzo a diciembre sin motivo';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%requiere motivo%' THEN
      RAISE;
    END IF;
END $$;
SELECT public.aprobar_renovacion(
  '20000000-0000-4000-8000-000000000061',
  DATE '2027-12-01',
  NULL,
  'la fecha real es diciembre'
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.renovaciones
    WHERE id = '20000000-0000-4000-8000-000000000061'
      AND fecha_pago = DATE '2027-12-01'
      AND monto_esperado = 100
  ) THEN
    RAISE EXCEPTION 'diciembre no quedo en 100';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.auditoria
    WHERE renovacion_id = '20000000-0000-4000-8000-000000000061'
      AND accion = 'cambio_monto'
  ) THEN
    RAISE EXCEPTION 'mover la fecha no dejo cambio_monto';
  END IF;
END $$;

-- Corregir la fecha sin mover la cuota no exige motivo (renovación de socio base).
RESET ROLE;
INSERT INTO public.renovaciones (id, socio_id, anio, fecha_pago, monto_reportado)
VALUES (
  '20000000-0000-4000-8000-000000000021',
  '10000000-0000-4000-8000-000000000002',
  2027,
  DATE '2027-01-10',
  1200
);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', false);
SELECT public.aprobar_renovacion(
  '20000000-0000-4000-8000-000000000021',
  DATE '2027-06-01',
  NULL,
  NULL
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.renovaciones
    WHERE id = '20000000-0000-4000-8000-000000000021'
      AND fecha_pago = DATE '2027-06-01'
      AND monto_esperado = 1200
      AND motivo_cambio IS NULL
  ) THEN
    RAISE EXCEPTION 'corregir la fecha de una renovacion cambio el monto';
  END IF;
END $$;
RESET ROLE;

-- M3: 2099 no entra. Dos aprobadas del mismo socio y año tampoco.
DO $$
BEGIN
  INSERT INTO public.renovaciones (socio_id, anio, fecha_pago, monto_reportado)
  VALUES (
    '10000000-0000-4000-8000-000000000006',
    2099,
    DATE '2099-01-01',
    1
  );
  RAISE EXCEPTION 'acepto fecha 2099';
EXCEPTION
  WHEN check_violation THEN
    NULL;
END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c5', false);
INSERT INTO public.renovaciones (id, socio_id, anio, fecha_pago, monto_reportado)
VALUES (
  '20000000-0000-4000-8000-000000000072',
  '10000000-0000-4000-8000-000000000007',
  2027,
  DATE '2027-01-15',
  1200
);
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b1', false);
DO $$
BEGIN
  PERFORM public.aprobar_renovacion('20000000-0000-4000-8000-000000000072');
  RAISE EXCEPTION 'segunda aprobacion del mismo año';
EXCEPTION
  WHEN unique_violation THEN
    NULL;
END $$;

-- L4: negativo y más de 2 decimales.
DO $$
BEGIN
  PERFORM public.aprobar_renovacion(
    '20000000-0000-4000-8000-000000000072',
    NULL,
    -500,
    'negativo'
  );
  RAISE EXCEPTION 'acepto monto negativo';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%monto invalido%' THEN
      RAISE;
    END IF;
END $$;
DO $$
BEGIN
  PERFORM public.aprobar_renovacion(
    '20000000-0000-4000-8000-000000000072',
    NULL,
    100.001,
    'tres decimales'
  );
  RAISE EXCEPTION 'acepto tres decimales';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%monto invalido%' THEN
      RAISE;
    END IF;
END $$;
RESET ROLE;

-- Un solo redondeo: 1000 * 11 / 12 = 916.67. Socio sin historial, así que es alta.
INSERT INTO public.cuota_anual (anio, monto) VALUES (2028, 1000);
INSERT INTO public.socios (id, nombre)
VALUES ('10000000-0000-4000-8000-000000000005', 'Fonda Redondeo');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b1', false);
DO $$
DECLARE
  got numeric;
  expect numeric := round((1000 * 11)::numeric / 12, 2);
BEGIN
  got := public.calcular_monto_esperado(
    '10000000-0000-4000-8000-000000000005',
    DATE '2028-02-15',
    2028
  );
  IF got <> expect THEN
    RAISE EXCEPTION 'prorrateo 2028 febrero = %, esperaba %', got, expect;
  END IF;
END $$;
RESET ROLE;

-- M4: no se reescribe un comprobante, ni se sube otro cuando ya no está pendiente.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c6', false);
DO $$
BEGIN
  INSERT INTO storage.objects (bucket_id, name, metadata)
  VALUES (
    'comprobantes',
    '10000000-0000-4000-8000-000000000006/20000000-0000-4000-8000-000000000061/x.pdf',
    '{"mimetype":"text/html"}'
  );
  RAISE EXCEPTION 'acepto html';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;
DO $$
DECLARE
  n int;
BEGIN
  UPDATE storage.objects
  SET metadata = '{"swapped":true}'
  WHERE name LIKE '%000000000061/c.pdf';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'reescribio un comprobante, filas %', n;
  END IF;
END $$;
DO $$
BEGIN
  INSERT INTO storage.objects (bucket_id, name)
  VALUES (
    'comprobantes',
    '10000000-0000-4000-8000-000000000006/20000000-0000-4000-8000-000000000061/nuevo.pdf'
  );
  RAISE EXCEPTION 'subio otro archivo a una renovacion aprobada';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;
RESET ROLE;

-- L1: mover una tercera cuenta hacia un socio que ya tiene dos.
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-0000000000c3', 'tercero@example.test');
INSERT INTO public.socios (id, nombre)
VALUES ('10000000-0000-4000-8000-00000000000d', 'Fonda Puente');
INSERT INTO public.cuentas_socio (socio_id, user_id)
VALUES (
  '10000000-0000-4000-8000-00000000000d',
  '00000000-0000-4000-8000-0000000000c3'
);
DO $$
BEGIN
  UPDATE public.cuentas_socio
  SET socio_id = '10000000-0000-4000-8000-000000000001'
  WHERE user_id = '00000000-0000-4000-8000-0000000000c3';
  RAISE EXCEPTION 'la tercera cuenta entro por UPDATE';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%maximo 2 cuentas%' THEN
      RAISE;
    END IF;
END $$;
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n
  FROM public.cuentas_socio
  WHERE socio_id = '10000000-0000-4000-8000-000000000001';
  IF n <> 2 THEN
    RAISE EXCEPTION 'socio A tiene % cuentas', n;
  END IF;
END $$;

-- L3: ni el owner trunca la auditoría.
DO $$
BEGIN
  TRUNCATE public.auditoria;
  RAISE EXCEPTION 'truncate de auditoria paso';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%append-only%' THEN
      RAISE;
    END IF;
END $$;

SET ROLE anon;
DO $$
BEGIN
  PERFORM public.aprobar_renovacion('20000000-0000-4000-8000-000000000072');
  RAISE EXCEPTION 'anon ejecuto aprobar';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;
RESET ROLE;

SELECT 'fase2a neg ok' AS result;
