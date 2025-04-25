-- Function to check if the current user can access a table
CREATE OR REPLACE FUNCTION public.check_rls_policies(table_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result jsonb;
    user_id uuid;
BEGIN
    -- Get the current user ID
    user_id := auth.uid();
    
    -- Build the result
    result := jsonb_build_object(
        'user_id', user_id,
        'table', table_name,
        'has_access', user_id IS NOT NULL
    );
    
    -- Return the result
    RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.check_rls_policies TO authenticated;
