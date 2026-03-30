CREATE OR REPLACE FUNCTION public.nomus_http_post(payload jsonb, auth_header text, timeout_ms integer DEFAULT 120000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net'
SET statement_timeout TO '180s'
AS $function$
DECLARE
  request_id bigint;
  response_record record;
  response_body_text text;
BEGIN
  IF payload IS NULL THEN
    RAISE EXCEPTION 'payload is required';
  END IF;

  IF auth_header IS NULL OR btrim(auth_header) = '' THEN
    RAISE EXCEPTION 'auth_header is required';
  END IF;

  request_id := net.http_post(
    url := 'https://live.nomus.com.br/live/rest/pedidos',
    body := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Accept', 'application/json',
      'Authorization', auth_header
    ),
    timeout_milliseconds := timeout_ms
  );

  SELECT *
  INTO response_record
  FROM net.http_collect_response(request_id, false);

  response_body_text := convert_from(response_record.body, 'UTF8');

  RETURN jsonb_build_object(
    'status_code', response_record.status_code,
    'headers', response_record.headers,
    'body', CASE
      WHEN response_body_text IS NULL OR btrim(response_body_text) = '' THEN '{}'::jsonb
      WHEN response_body_text ~ '^\s*[\[{]' THEN response_body_text::jsonb
      ELSE jsonb_build_object('raw', response_body_text)
    END
  );
END;
$function$;