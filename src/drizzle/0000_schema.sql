-- Function to generate random IDs
CREATE OR REPLACE FUNCTION generate_id() RETURNS varchar(20) AS $$
BEGIN
  RETURN substring(md5(random()::text || clock_timestamp()::text) from 1 for 20);
END;
$$ LANGUAGE plpgsql;

CREATE TABLE organizations (
  id varchar(20) PRIMARY KEY DEFAULT generate_id(),
  name varchar(255) NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE claims (
  id varchar(20) PRIMARY KEY DEFAULT generate_id(),
  organization_id varchar(20) NOT NULL REFERENCES organizations(id),
  patient_id varchar(20) NOT NULL,
  provider_id varchar(20) NOT NULL,
  diagnosis_code varchar(50) NOT NULL,
  amount numeric(10, 2) NOT NULL,
  status varchar(50) NOT NULL,
  assigned_processor_id varchar(20),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE patient_histories (
  id varchar(20) PRIMARY KEY DEFAULT generate_id(),
  organization_id varchar(20) NOT NULL REFERENCES organizations(id),
  patient_id varchar(20) NOT NULL,
  event_type varchar(50) NOT NULL,
  occurred_at timestamp NOT NULL,
  details text,
  processed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE claims_audit (
  id varchar(20) PRIMARY KEY DEFAULT generate_id(),
  claim_id varchar(20) NOT NULL REFERENCES claims(id),
  organization_id varchar(20) NOT NULL,
  action varchar(20) NOT NULL,
  changed_by varchar(100) NOT NULL,
  changed_at timestamp NOT NULL DEFAULT now(),
  old_values jsonb,
  new_values jsonb
);

CREATE INDEX claims_org_idx ON claims(organization_id);
CREATE INDEX claims_org_patient_idx ON claims(organization_id, patient_id);
CREATE INDEX claims_org_status_idx ON claims(organization_id, status);
CREATE INDEX claims_org_created_idx ON claims(organization_id, created_at);
CREATE INDEX claims_org_processor_idx ON claims(organization_id, assigned_processor_id);

CREATE INDEX patient_histories_org_patient_idx ON patient_histories(organization_id, patient_id);
CREATE INDEX patient_histories_occurred_idx ON patient_histories(occurred_at);

CREATE INDEX claims_audit_claim_idx ON claims_audit(claim_id);
CREATE INDEX claims_audit_org_changed_idx ON claims_audit(organization_id, changed_at);
CREATE INDEX claims_audit_changed_by_idx ON claims_audit(changed_by);
