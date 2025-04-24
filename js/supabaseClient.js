// Supabase client initialization
const supabaseUrl = 'https://keuxuonslkcvdeysdoge.supabase.co';
// Note: This is the anon key, not the service role key which should never be exposed in client-side code
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtldXh1b25zbGtjdmRleXNkb2dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUyNjc5MjUsImV4cCI6MjA2MDg0MzkyNX0.C1Bkoo9A3BlbfkHlUj7UdCmOPonMFftEFTOTHVQWIl4';

// Initialize the Supabase client
export const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

console.log('Supabase client initialized');
