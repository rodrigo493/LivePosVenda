-- Update phone number for the pós-vendas WhatsApp instance
UPDATE public.pipeline_whatsapp_instances
SET phone_number = '551936084008'
WHERE uazapi_instance_name = 'RODRIGO';
