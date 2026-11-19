-- Pruebas de fase 2a con fixtures sintéticos. Ningún socio real.
\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'socio.a@example.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'socio.b@example.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'tesorero@example.test'),
  ('00000000-0000-4000-8000-0000000000b2', 'presidente@example.test'),
  ('00000000-0000-4000-8000-0000000000b3', 'lectura@example.test');

INSERT INTO public.usuario_roles (user_id, rol) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'socio'),
  ('00000000-0000-4000-8000-0000000000a2', 'socio'),
  ('00000000-0000-4000-8000-0000000000b1', 'tesorero'),
  ('00000000-0000-4000-8000-0000000000b2', 'presidente'),
  ('00000000-0000-4000-8000-0000000000b3', 'admin_lectura');

INSERT INTO public.socios (id, nombre, es_socio_base) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Fonda Sintetica A', false),
  ('10000000-0000-4000-8000-000000000002', 'Fonda Sintetica B', true);

INSERT INTO public.cuentas_socio (socio_id, user_id) VALUES
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a2');

-- Tercera cuenta del socio A debe fallar (el segundo hueco lo ocupa otro usuario sintético).
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000000a3', 'socio.a2@example.test'),
  ('00000000-0000-4000-8000-0000000000a4', 'socio.a3@example.test');
INSERT INTO public.cuentas_socio (socio_id, user_id) VALUES
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a3');

DO $$
BEGIN
  INSERT INTO public.cuentas_socio (socio_id, user_id)
  VALUES ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a4');
  RAISE EXCEPTION 'debio rechazar la tercera cuenta';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%maximo 2 cuentas%' THEN
      RAISE;
    END IF;
END $$;

-- Anon no lee.
SET ROLE anon;
DO $$
BEGIN
  PERFORM count(*) FROM public.socios;
  RAISE EXCEPTION 'anon no debe leer socios';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;
RESET ROLE;

-- Aislamiento entre socios.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', false);
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM public.socios;
  IF n <> 1 THEN
    RAISE EXCEPTION 'socio A ve % socios, esperaba 1', n;
  END IF;
  PERFORM 1 FROM public.socios WHERE id = '10000000-0000-4000-8000-000000000002';
  IF FOUND THEN
    RAISE EXCEPTION 'socio A ve al socio B';
  END IF;
  BEGIN
    INSERT INTO public.renovaciones (socio_id, tipo, fecha_pago, monto_reportado, metodo)
    VALUES ('10000000-0000-4000-8000-000000000002', 'alta', DATE '2027-03-01', 1000, 'transferencia');
    RAISE EXCEPTION 'socio A no debe insertar renovacion de B';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN
      NULL;
  END;
END $$;
RESET ROLE;

-- Alta propia del socio nuevo (no base), marzo 2027 → 1000.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', false);
INSERT INTO public.renovaciones (id, socio_id, tipo, fecha_pago, monto_reportado, metodo, comprobante_path)
VALUES (
  '20000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000001',
  'alta',
  DATE '2027-03-15',
  1000,
  'transferencia',
  '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000010/comprobante.pdf'
);

DO $$
BEGIN
  INSERT INTO public.renovaciones (socio_id, tipo, fecha_pago, monto_reportado, estado)
  VALUES (
    '10000000-0000-4000-8000-000000000001',
    'alta',
    DATE '2027-04-01',
    900,
    'aprobada'
  );
  RAISE EXCEPTION 'el socio no debe fijar estado';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;
RESET ROLE;

-- El socio no aprueba su propia solicitud, ni escribe roles ni auditoría.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', false);
DO $$
BEGIN
  PERFORM public.aprobar_renovacion('20000000-0000-4000-8000-000000000010');
  RAISE EXCEPTION 'el socio no debe aprobar';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%solo tesorero o presidente%' THEN
      RAISE;
    END IF;
END $$;
DO $$
BEGIN
  INSERT INTO public.usuario_roles (user_id, rol)
  VALUES ('00000000-0000-4000-8000-0000000000a1', 'tesorero');
  RAISE EXCEPTION 'el socio no debe asignarse un rol';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;
DO $$
BEGIN
  INSERT INTO public.auditoria (accion, actor, renovacion_id, antes, despues)
  VALUES ('aprobar', '00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-000000000010', '{}', '{}');
  RAISE EXCEPTION 'el socio no debe insertar auditoria';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;
RESET ROLE;

-- admin_lectura ve ambas pero no aprueba.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b3', false);
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM public.renovaciones;
  IF n < 1 THEN
    RAISE EXCEPTION 'admin_lectura no ve renovaciones';
  END IF;
  BEGIN
    PERFORM public.aprobar_renovacion('20000000-0000-4000-8000-000000000010');
    RAISE EXCEPTION 'admin_lectura no debe aprobar';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%solo tesorero o presidente%' THEN
        RAISE;
      END IF;
  END;
END $$;
RESET ROLE;

-- Prorrateo de los 12 meses (socio no base, alta) + base y renovación.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b1', false);
DO $$
DECLARE
  m int;
  got numeric;
  expect numeric;
BEGIN
  FOR m IN 1..12 LOOP
    expect := (1200.00 / 12) * (13 - m);
    got := public.calcular_monto_esperado(
      '10000000-0000-4000-8000-000000000001',
      'alta',
      make_date(2027, m, 15)
    );
    IF got IS DISTINCT FROM expect THEN
      RAISE EXCEPTION 'mes %: obtuvo % esperaba %', m, got, expect;
    END IF;
  END LOOP;

  -- El mes de aprobación no cuenta: enero aunque "hoy" no sea enero.
  got := public.calcular_monto_esperado(
    '10000000-0000-4000-8000-000000000001',
    'alta',
    DATE '2027-01-31'
  );
  IF got <> 1200 THEN
    RAISE EXCEPTION 'enero debio ser 1200, fue %', got;
  END IF;

  got := public.calcular_monto_esperado(
    '10000000-0000-4000-8000-000000000002',
    'alta',
    DATE '2027-12-01'
  );
  IF got <> 1200 THEN
    RAISE EXCEPTION 'socio base en diciembre debio pagar 1200, fue %', got;
  END IF;

  got := public.calcular_monto_esperado(
    '10000000-0000-4000-8000-000000000001',
    'renovacion',
    DATE '2027-12-01'
  );
  IF got <> 1200 THEN
    RAISE EXCEPTION 'renovacion en diciembre debio ser 1200, fue %', got;
  END IF;
END $$;
RESET ROLE;

-- Override sin motivo falla. Con motivo, tesorero aprueba y deja auditoría.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b1', false);
DO $$
BEGIN
  PERFORM public.aprobar_renovacion(
    '20000000-0000-4000-8000-000000000010',
    NULL,
    50,
    NULL
  );
  RAISE EXCEPTION 'override sin motivo debio fallar';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%requiere motivo%' THEN
      RAISE;
    END IF;
END $$;

SELECT public.aprobar_renovacion(
  '20000000-0000-4000-8000-000000000010',
  DATE '2027-02-02',
  1050,
  'ajuste de captura, no es la cuota de febrero'
);

DO $$
DECLARE
  est text;
  mem text;
  n_cambio int;
  n_aprobar int;
BEGIN
  SELECT estado INTO est FROM public.renovaciones WHERE id = '20000000-0000-4000-8000-000000000010';
  IF est <> 'aprobada' THEN
    RAISE EXCEPTION 'estado %', est;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.renovaciones
    WHERE id = '20000000-0000-4000-8000-000000000010'
      AND fecha_pago = DATE '2027-02-02'
      AND monto_esperado = 1050
  ) THEN
    RAISE EXCEPTION 'fecha o monto de la aprobacion no quedaron como el override';
  END IF;
  SELECT estado INTO mem
  FROM public.membresias
  WHERE socio_id = '10000000-0000-4000-8000-000000000001' AND anio = 2027;
  IF mem <> 'activa' THEN
    RAISE EXCEPTION 'membresia %', mem;
  END IF;
  SELECT count(*) INTO n_cambio FROM public.auditoria WHERE accion = 'cambio_monto';
  SELECT count(*) INTO n_aprobar FROM public.auditoria WHERE accion = 'aprobar';
  IF n_cambio <> 1 OR n_aprobar <> 1 THEN
    RAISE EXCEPTION 'auditoria cambio=% aprobar=%', n_cambio, n_aprobar;
  END IF;
END $$;
RESET ROLE;

-- Corregir fecha_pago sin override no exige motivo y recalcula la cuota del año.
INSERT INTO public.renovaciones (id, socio_id, tipo, fecha_pago, monto_reportado, metodo)
VALUES (
  '20000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000001',
  'alta',
  DATE '2027-12-01',
  100,
  'transferencia'
);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b1', false);
SELECT public.aprobar_renovacion(
  '20000000-0000-4000-8000-000000000011',
  DATE '2027-01-31',
  NULL,
  NULL
);
DO $$
DECLARE
  n_cambio int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.renovaciones
    WHERE id = '20000000-0000-4000-8000-000000000011'
      AND fecha_pago = DATE '2027-01-31'
      AND monto_esperado = 1200
      AND motivo_cambio IS NULL
  ) THEN
    RAISE EXCEPTION 'corregir la fecha no dejo la cuota de enero';
  END IF;
  SELECT count(*) INTO n_cambio FROM public.auditoria WHERE accion = 'cambio_monto';
  IF n_cambio <> 1 THEN
    RAISE EXCEPTION 'corregir la fecha no debe ser cambio_monto, hay %', n_cambio;
  END IF;
END $$;
RESET ROLE;

-- Presidente rechaza otra solicitud.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', false);
INSERT INTO public.renovaciones (id, socio_id, tipo, fecha_pago, monto_reportado, metodo)
VALUES (
  '20000000-0000-4000-8000-000000000020',
  '10000000-0000-4000-8000-000000000002',
  'renovacion',
  DATE '2027-01-10',
  1200,
  'efectivo'
);
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', false);
SELECT public.rechazar_renovacion(
  '20000000-0000-4000-8000-000000000020',
  'comprobante ilegible'
);
DO $$
DECLARE
  est text;
BEGIN
  SELECT estado INTO est FROM public.renovaciones WHERE id = '20000000-0000-4000-8000-000000000020';
  IF est <> 'rechazada' THEN
    RAISE EXCEPTION 'rechazo dejo %', est;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.auditoria WHERE accion = 'rechazar') THEN
    RAISE EXCEPTION 'falta auditoria de rechazo';
  END IF;
END $$;
RESET ROLE;

-- Auditoría append-only, incluso para el owner.
DO $$
BEGIN
  UPDATE public.auditoria SET accion = 'aprobar' WHERE accion = 'rechazar';
  RAISE EXCEPTION 'update de auditoria debio fallar';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%append-only%' THEN
      RAISE;
    END IF;
END $$;

DO $$
BEGIN
  DELETE FROM public.auditoria;
  RAISE EXCEPTION 'delete de auditoria debio fallar';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%append-only%' THEN
      RAISE;
    END IF;
END $$;

-- Pendiente > 24 h visible para staff, no para el otro socio.
INSERT INTO public.renovaciones (id, socio_id, tipo, fecha_pago, monto_reportado, created_at)
VALUES (
  '20000000-0000-4000-8000-000000000030',
  '10000000-0000-4000-8000-000000000001',
  'alta',
  DATE '2027-06-01',
  700,
  now() - interval '25 hours'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b3', false);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.renovaciones_pendientes_24h
    WHERE id = '20000000-0000-4000-8000-000000000030'
  ) THEN
    RAISE EXCEPTION 'admin no ve pendiente > 24h';
  END IF;
END $$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', false);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.renovaciones_pendientes_24h
    WHERE id = '20000000-0000-4000-8000-000000000030'
  ) THEN
    RAISE EXCEPTION 'socio B ve pendiente de A';
  END IF;
END $$;
RESET ROLE;

-- Storage: solo la carpeta propia; anon no.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', false);
INSERT INTO storage.objects (bucket_id, name)
VALUES (
  'comprobantes',
  '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000010/comprobante.pdf'
);
DO $$
BEGIN
  INSERT INTO storage.objects (bucket_id, name)
  VALUES (
    'comprobantes',
    '10000000-0000-4000-8000-000000000002/20000000-0000-4000-8000-000000000020/otro.pdf'
  );
  RAISE EXCEPTION 'socio A subio en carpeta de B';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;
DO $$
BEGIN
  INSERT INTO storage.objects (bucket_id, name)
  VALUES (
    'comprobantes',
    '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000010/comprobante.exe'
  );
  RAISE EXCEPTION 'extension no permitida';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;
RESET ROLE;

SET ROLE anon;
DO $$
BEGIN
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('comprobantes', '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000010/x.pdf');
  RAISE EXCEPTION 'anon subio comprobante';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b1', false);
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'comprobantes';
  IF n < 1 THEN
    RAISE EXCEPTION 'tesorero no lee comprobantes';
  END IF;
END $$;
RESET ROLE;

SELECT 'fase2a ok' AS result;
