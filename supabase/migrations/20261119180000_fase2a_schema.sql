-- Fase 2a: socios, cuotas, renovaciones, auditoría, storage privado.
-- No siembra fichas reales. La cuota 2027 es un renglón de configuración, no un literal en el cálculo.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO postgres;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

CREATE TABLE public.usuario_roles (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  rol text NOT NULL CHECK (rol IN ('socio', 'tesorero', 'presidente', 'admin_lectura')),
  PRIMARY KEY (user_id, rol)
);

CREATE TABLE public.socios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  es_socio_base boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cuentas_socio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_id uuid NOT NULL REFERENCES public.socios (id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cuentas_socio_socio_id_idx ON public.cuentas_socio (socio_id);

CREATE TABLE public.cuota_anual (
  anio integer PRIMARY KEY CHECK (anio BETWEEN 2000 AND 2100),
  monto numeric(12, 2) NOT NULL CHECK (monto > 0)
);

CREATE TABLE public.membresias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_id uuid NOT NULL REFERENCES public.socios (id) ON DELETE CASCADE,
  anio integer NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
  estado text NOT NULL CHECK (estado IN ('activa', 'vencida', 'en_revision')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (socio_id, anio)
);

CREATE TABLE public.renovaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_id uuid NOT NULL REFERENCES public.socios (id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('alta', 'renovacion')),
  fecha_pago date NOT NULL,
  monto_reportado numeric(12, 2) NOT NULL CHECK (monto_reportado >= 0),
  metodo text,
  comprobante_path text,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  monto_esperado numeric(12, 2),
  motivo_cambio text,
  motivo_rechazo text,
  aprobado_por uuid REFERENCES auth.users (id),
  aprobado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT renovaciones_comprobante_path_chk CHECK (
    comprobante_path IS NULL
    OR comprobante_path LIKE (socio_id::text || '/' || id::text || '/%')
  )
);

CREATE INDEX renovaciones_socio_estado_idx ON public.renovaciones (socio_id, estado);
CREATE INDEX renovaciones_pendientes_created_idx
  ON public.renovaciones (created_at)
  WHERE estado = 'pendiente';

CREATE TABLE public.auditoria (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  accion text NOT NULL CHECK (accion IN ('aprobar', 'rechazar', 'cambio_monto')),
  actor uuid NOT NULL,
  renovacion_id uuid NOT NULL REFERENCES public.renovaciones (id),
  antes jsonb NOT NULL,
  despues jsonb NOT NULL,
  ts timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auditoria_renovacion_idx ON public.auditoria (renovacion_id, ts);

INSERT INTO public.cuota_anual (anio, monto) VALUES (2027, 1200.00);

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER, search_path fijo y vacío). No usan user_metadata.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.has_rol(p_rol text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.rol = p_rol
  );
$$;

CREATE OR REPLACE FUNCTION private.es_lector_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.rol IN ('tesorero', 'presidente', 'admin_lectura')
  );
$$;

CREATE OR REPLACE FUNCTION private.puede_aprobar()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.rol IN ('tesorero', 'presidente')
  );
$$;

CREATE OR REPLACE FUNCTION private.socio_ids_propios()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT cs.socio_id
  FROM public.cuentas_socio cs
  WHERE cs.user_id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION private.has_rol(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.es_lector_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.puede_aprobar() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.socio_ids_propios() FROM PUBLIC;

-- Las políticas y los triggers corren como el rol que actúa: hace falta USAGE + EXECUTE.
-- Las RPC de dinero se otorgan más abajo, solo a authenticated, y no están en el API.
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.es_lector_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.socio_ids_propios() TO authenticated;

-- ---------------------------------------------------------------------------
-- Límites y columnas protegidas
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.enforce_max_two_cuentas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
  FROM public.cuentas_socio
  WHERE socio_id = NEW.socio_id;
  IF n >= 2 THEN
    RAISE EXCEPTION 'maximo 2 cuentas por socio';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cuentas_socio_max_two
BEFORE INSERT ON public.cuentas_socio
FOR EACH ROW
EXECUTE FUNCTION private.enforce_max_two_cuentas();

CREATE OR REPLACE FUNCTION private.cuentas_socio_no_reasignar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.socio_id IS DISTINCT FROM OLD.socio_id) THEN
    RAISE EXCEPTION 'no se puede reasignar la cuenta';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cuentas_socio_no_reasignar
BEFORE UPDATE ON public.cuentas_socio
FOR EACH ROW
EXECUTE FUNCTION private.cuentas_socio_no_reasignar();

CREATE OR REPLACE FUNCTION private.socios_proteger_base()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND NEW.es_socio_base IS DISTINCT FROM OLD.es_socio_base THEN
    RAISE EXCEPTION 'es_socio_base no es editable por el socio';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER socios_proteger_base
BEFORE UPDATE ON public.socios
FOR EACH ROW
EXECUTE FUNCTION private.socios_proteger_base();

CREATE OR REPLACE FUNCTION private.auditoria_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'auditoria es append-only';
END;
$$;

CREATE TRIGGER auditoria_no_update
BEFORE UPDATE OR DELETE ON public.auditoria
FOR EACH ROW
EXECUTE FUNCTION private.auditoria_append_only();

REVOKE ALL ON FUNCTION private.enforce_max_two_cuentas() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.cuentas_socio_no_reasignar() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.socios_proteger_base() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.auditoria_append_only() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.enforce_max_two_cuentas() TO authenticated;
GRANT EXECUTE ON FUNCTION private.cuentas_socio_no_reasignar() TO authenticated;
GRANT EXECUTE ON FUNCTION private.socios_proteger_base() TO authenticated;
GRANT EXECUTE ON FUNCTION private.auditoria_append_only() TO authenticated;

-- ---------------------------------------------------------------------------
-- Dinero: el mes de aprobación no entra; solo fecha_pago y la cuota del año
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.calcular_monto_esperado(
  p_socio_id uuid,
  p_tipo text,
  p_fecha date
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_base boolean;
  v_cuota numeric;
  v_month integer;
BEGIN
  IF NOT private.es_lector_admin()
     AND p_socio_id NOT IN (SELECT private.socio_ids_propios()) THEN
    RAISE EXCEPTION 'no autorizado';
  END IF;

  SELECT s.es_socio_base INTO v_base
  FROM public.socios s
  WHERE s.id = p_socio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'socio no encontrado';
  END IF;

  SELECT c.monto INTO v_cuota
  FROM public.cuota_anual c
  WHERE c.anio = EXTRACT(YEAR FROM p_fecha)::integer;
  IF v_cuota IS NULL THEN
    RAISE EXCEPTION 'no hay cuota_anual para %', EXTRACT(YEAR FROM p_fecha)::integer;
  END IF;

  IF p_tipo = 'renovacion' OR v_base THEN
    RETURN v_cuota;
  END IF;
  IF p_tipo <> 'alta' THEN
    RAISE EXCEPTION 'tipo invalido';
  END IF;

  v_month := EXTRACT(MONTH FROM p_fecha)::integer;
  RETURN round((v_cuota / 12) * (13 - v_month), 2);
END;
$$;

CREATE OR REPLACE FUNCTION private.renovacion_snapshot(p public.renovaciones)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'estado', p.estado,
    'tipo', p.tipo,
    'fecha_pago', p.fecha_pago,
    'monto_reportado', p.monto_reportado,
    'monto_esperado', p.monto_esperado,
    'motivo_cambio', p.motivo_cambio,
    'motivo_rechazo', p.motivo_rechazo,
    'aprobado_por', p.aprobado_por,
    'aprobado_at', p.aprobado_at
  );
$$;

CREATE OR REPLACE FUNCTION private.aprobar_renovacion(
  p_renovacion_id uuid,
  p_fecha_pago date DEFAULT NULL,
  p_monto_override numeric DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS public.renovaciones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v public.renovaciones;
  v_fecha date;
  v_esperado numeric;
  v_final numeric;
  v_antes jsonb;
  v_despues jsonb;
  v_anio integer;
BEGIN
  IF NOT private.puede_aprobar() THEN
    RAISE EXCEPTION 'solo tesorero o presidente pueden aprobar';
  END IF;

  SELECT * INTO v
  FROM public.renovaciones
  WHERE id = p_renovacion_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'renovacion no encontrada';
  END IF;
  IF v.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'la renovacion no esta pendiente';
  END IF;

  v_antes := private.renovacion_snapshot(v);
  v_fecha := COALESCE(p_fecha_pago, v.fecha_pago);
  v_esperado := private.calcular_monto_esperado(v.socio_id, v.tipo, v_fecha);

  IF p_monto_override IS NOT NULL AND p_monto_override IS DISTINCT FROM v_esperado THEN
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
      RAISE EXCEPTION 'override de monto requiere motivo';
    END IF;
    v_final := p_monto_override;
  ELSE
    v_final := v_esperado;
    p_motivo := NULL;
  END IF;

  UPDATE public.renovaciones
  SET fecha_pago = v_fecha,
      monto_esperado = v_final,
      motivo_cambio = p_motivo,
      estado = 'aprobada',
      aprobado_por = (SELECT auth.uid()),
      aprobado_at = now()
  WHERE id = p_renovacion_id
  RETURNING * INTO v;

  v_despues := private.renovacion_snapshot(v);

  IF p_motivo IS NOT NULL THEN
    INSERT INTO public.auditoria (accion, actor, renovacion_id, antes, despues)
    VALUES ('cambio_monto', (SELECT auth.uid()), p_renovacion_id, v_antes, v_despues);
  END IF;

  INSERT INTO public.auditoria (accion, actor, renovacion_id, antes, despues)
  VALUES ('aprobar', (SELECT auth.uid()), p_renovacion_id, v_antes, v_despues);

  v_anio := EXTRACT(YEAR FROM v_fecha)::integer;
  INSERT INTO public.membresias (socio_id, anio, estado)
  VALUES (v.socio_id, v_anio, 'activa')
  ON CONFLICT (socio_id, anio) DO UPDATE
    SET estado = 'activa',
        updated_at = now();

  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION private.rechazar_renovacion(
  p_renovacion_id uuid,
  p_motivo text
)
RETURNS public.renovaciones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v public.renovaciones;
  v_antes jsonb;
BEGIN
  IF NOT private.puede_aprobar() THEN
    RAISE EXCEPTION 'solo tesorero o presidente pueden rechazar';
  END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'rechazo requiere motivo';
  END IF;

  SELECT * INTO v
  FROM public.renovaciones
  WHERE id = p_renovacion_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'renovacion no encontrada';
  END IF;
  IF v.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'la renovacion no esta pendiente';
  END IF;

  v_antes := private.renovacion_snapshot(v);

  UPDATE public.renovaciones
  SET estado = 'rechazada',
      motivo_rechazo = btrim(p_motivo),
      aprobado_por = (SELECT auth.uid()),
      aprobado_at = now()
  WHERE id = p_renovacion_id
  RETURNING * INTO v;

  INSERT INTO public.auditoria (accion, actor, renovacion_id, antes, despues)
  VALUES (
    'rechazar',
    (SELECT auth.uid()),
    p_renovacion_id,
    v_antes,
    private.renovacion_snapshot(v)
  );

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION private.calcular_monto_esperado(uuid, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.renovacion_snapshot(public.renovaciones) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.aprobar_renovacion(uuid, date, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.rechazar_renovacion(uuid, text) FROM PUBLIC;
-- PostgREST no expone `private`. Estas tres sí se pueden llamar desde una
-- sesión authenticated (el API no las publica). Siguen revisando el rol adentro.
GRANT EXECUTE ON FUNCTION private.calcular_monto_esperado(uuid, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION private.aprobar_renovacion(uuid, date, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.rechazar_renovacion(uuid, text) TO authenticated;

-- Wrappers en public: INVOKER, no DEFINER. El privilegio vive en private.*.
CREATE OR REPLACE FUNCTION public.aprobar_renovacion(
  p_renovacion_id uuid,
  p_fecha_pago date DEFAULT NULL,
  p_monto_override numeric DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS public.renovaciones
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN private.aprobar_renovacion(p_renovacion_id, p_fecha_pago, p_monto_override, p_motivo);
END;
$$;

CREATE OR REPLACE FUNCTION public.rechazar_renovacion(
  p_renovacion_id uuid,
  p_motivo text
)
RETURNS public.renovaciones
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN private.rechazar_renovacion(p_renovacion_id, p_motivo);
END;
$$;

CREATE OR REPLACE FUNCTION public.calcular_monto_esperado(
  p_socio_id uuid,
  p_tipo text,
  p_fecha date
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.calcular_monto_esperado(p_socio_id, p_tipo, p_fecha);
$$;

REVOKE ALL ON FUNCTION public.aprobar_renovacion(uuid, date, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rechazar_renovacion(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calcular_monto_esperado(uuid, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aprobar_renovacion(uuid, date, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rechazar_renovacion(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_monto_esperado(uuid, text, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- Vista de cola > 24 h (security invoker: respeta RLS del llamador)
-- ---------------------------------------------------------------------------

CREATE VIEW public.renovaciones_pendientes_24h
WITH (security_invoker = true) AS
SELECT r.*
FROM public.renovaciones r
WHERE r.estado = 'pendiente'
  AND r.created_at < (now() - interval '24 hours');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.usuario_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.socios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuentas_socio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuota_anual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membresias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renovaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY usuario_roles_select ON public.usuario_roles
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (SELECT private.es_lector_admin())
);

CREATE POLICY socios_select ON public.socios
FOR SELECT TO authenticated
USING (
  id IN (SELECT private.socio_ids_propios())
  OR (SELECT private.es_lector_admin())
);

CREATE POLICY socios_update_own ON public.socios
FOR UPDATE TO authenticated
USING (id IN (SELECT private.socio_ids_propios()))
WITH CHECK (id IN (SELECT private.socio_ids_propios()));

CREATE POLICY cuentas_select ON public.cuentas_socio
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (SELECT private.es_lector_admin())
);

CREATE POLICY cuentas_update_own ON public.cuentas_socio
FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY cuota_select ON public.cuota_anual
FOR SELECT TO authenticated
USING (true);

CREATE POLICY membresias_select ON public.membresias
FOR SELECT TO authenticated
USING (
  socio_id IN (SELECT private.socio_ids_propios())
  OR (SELECT private.es_lector_admin())
);

CREATE POLICY renovaciones_select ON public.renovaciones
FOR SELECT TO authenticated
USING (
  socio_id IN (SELECT private.socio_ids_propios())
  OR (SELECT private.es_lector_admin())
);

CREATE POLICY renovaciones_insert_own ON public.renovaciones
FOR INSERT TO authenticated
WITH CHECK (
  socio_id IN (SELECT private.socio_ids_propios())
  AND estado = 'pendiente'
  AND monto_esperado IS NULL
  AND aprobado_por IS NULL
  AND aprobado_at IS NULL
  AND motivo_cambio IS NULL
  AND motivo_rechazo IS NULL
);

CREATE POLICY auditoria_select_staff ON public.auditoria
FOR SELECT TO authenticated
USING ((SELECT private.es_lector_admin()));

GRANT USAGE ON SCHEMA public TO anon, authenticated;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.usuario_roles, public.socios, public.cuentas_socio,
  public.cuota_anual, public.membresias, public.renovaciones, public.auditoria
  TO authenticated;
GRANT UPDATE ON public.socios, public.cuentas_socio TO authenticated;
GRANT INSERT (
  id, socio_id, tipo, fecha_pago, monto_reportado, metodo, comprobante_path
) ON public.renovaciones TO authenticated;
GRANT SELECT ON public.renovaciones_pendientes_24h TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.auditoria FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE ON public.renovaciones FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.usuario_roles FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.cuota_anual FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.membresias FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage privado: comprobantes/{socio_id}/{renovacion_id}/archivo
--
-- storage.* pertenece a supabase_storage_admin. Esta migración no hace
-- ALTER, GRANT ni REVOKE ahí: postgres no es el dueño y el apply se cae.
-- RLS ya viene activo. Las políticas sí se pueden crear.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comprobantes',
  'comprobantes',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage'
      AND c.relname = 'objects'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'storage.objects no tiene RLS; en Supabase ya viene activo';
  END IF;
END $$;

CREATE POLICY comprobantes_socio_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'comprobantes'
  AND (storage.foldername(name))[1] IN (
    SELECT cs.socio_id::text FROM public.cuentas_socio cs WHERE cs.user_id = (SELECT auth.uid())
  )
  AND (storage.foldername(name))[2] IN (
    SELECT r.id::text
    FROM public.renovaciones r
    JOIN public.cuentas_socio cs ON cs.socio_id = r.socio_id
    WHERE cs.user_id = (SELECT auth.uid())
  )
  AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'pdf')
);

CREATE POLICY comprobantes_socio_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'comprobantes'
  AND (
    (SELECT private.es_lector_admin())
    OR (
      (storage.foldername(name))[1] IN (
        SELECT cs.socio_id::text FROM public.cuentas_socio cs WHERE cs.user_id = (SELECT auth.uid())
      )
    )
  )
);

CREATE POLICY comprobantes_socio_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'comprobantes'
  AND (storage.foldername(name))[1] IN (
    SELECT cs.socio_id::text FROM public.cuentas_socio cs WHERE cs.user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'comprobantes'
  AND (storage.foldername(name))[1] IN (
    SELECT cs.socio_id::text FROM public.cuentas_socio cs WHERE cs.user_id = (SELECT auth.uid())
  )
  AND (storage.foldername(name))[2] IN (
    SELECT r.id::text
    FROM public.renovaciones r
    JOIN public.cuentas_socio cs ON cs.socio_id = r.socio_id
    WHERE cs.user_id = (SELECT auth.uid())
  )
  AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'pdf')
);
