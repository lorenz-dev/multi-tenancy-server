CREATE FUNCTION log_claim_changes() RETURNS TRIGGER AS $$
DECLARE
  user_id TEXT;
BEGIN
  user_id := current_setting('app.user_id', true);
  IF user_id IS NULL OR user_id = '' THEN
    user_id := 'system';
  END IF;

  IF (TG_OP = 'INSERT') THEN
    INSERT INTO claims_audit (id, claim_id, organization_id, action, changed_by, new_values)
    VALUES (substring(md5(random()::text || clock_timestamp()::text) from 1 for 20), NEW.id, NEW.organization_id, 'INSERT', user_id, row_to_json(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO claims_audit (id, claim_id, organization_id, action, changed_by, old_values, new_values)
    VALUES (substring(md5(random()::text || clock_timestamp()::text) from 1 for 20), NEW.id, NEW.organization_id, 'UPDATE', user_id, row_to_json(OLD), row_to_json(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO claims_audit (id, claim_id, organization_id, action, changed_by, old_values)
    VALUES (substring(md5(random()::text || clock_timestamp()::text) from 1 for 20), OLD.id, OLD.organization_id, 'DELETE', user_id, row_to_json(OLD));
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER claims_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON claims
FOR EACH ROW EXECUTE FUNCTION log_claim_changes();
