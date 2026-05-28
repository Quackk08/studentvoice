-- Allow admins to delete (dismiss) all reports for a proposal.
CREATE POLICY "reports_delete_admin" ON reports FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));
