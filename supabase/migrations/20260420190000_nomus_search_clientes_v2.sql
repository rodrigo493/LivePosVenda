
CREATE OR REPLACE FUNCTION public.nomus_search_clientes(search_term text, auth_header text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net'
 SET statement_timeout TO '120s'
AS $function$
DECLARE
  request_id bigint;
  response_record record;
  response_body_text text;
  term_encoded text;
BEGIN
  term_encoded := replace(replace(search_term, ' ', '%20'), '&', '%26');
  request_id := net.http_get(
    url := 'https://live.nomus.com.br/live/rest/pessoas?query=nome==*' || term_encoded || '*',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Accept', 'application/json',
      'Authorization', 'Basic ' || auth_header
    ),
    timeout_milliseconds := 90000
  );
  SELECT * INTO response_record FROM net.http_collect_response(request_id, false);
  response_body_text := convert_from(response_record.body, 'UTF8');
  RETURN jsonb_build_object('status_code', response_record.status_code, 'body', response_body_text);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.nomus_search_clientes(text, text) TO authenticated;
