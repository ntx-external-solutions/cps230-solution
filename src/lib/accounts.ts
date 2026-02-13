import { supabase } from './supabase';

export interface AccountCheckResult {
  accountId: string;
  isFirstUser: boolean;
  accountExists: boolean;
}

/**
 * Checks if an account exists for the given email domain
 * If not, optionally creates one
 * @param email - User's email address
 * @param accountName - Optional account name (required for first user)
 * @returns Account information including whether user is first
 */
export async function checkOrCreateAccount(
  email: string,
  accountName?: string
): Promise<AccountCheckResult> {
  const { data, error } = await supabase.rpc('get_or_create_account_by_email', {
    user_email: email,
    account_name_param: accountName || null,
  });

  if (error) {
    console.error('Error checking/creating account:', error);
    throw new Error(`Failed to check account: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('No account data returned');
  }

  const result = data[0];
  return {
    accountId: result.account_id,
    isFirstUser: result.is_first_user,
    accountExists: result.account_exists,
  };
}

/**
 * Creates a user profile with the specified account and role
 * @param userId - Supabase auth user ID
 * @param email - User's email
 * @param accountId - Account ID to associate with
 * @param isFirstUser - Whether this is the first user (will be promaster)
 * @param fullName - Optional full name
 */
export async function createUserProfileWithAccount(
  userId: string,
  email: string,
  accountId: string,
  isFirstUser: boolean,
  fullName?: string
): Promise<string> {
  const { data, error } = await supabase.rpc('create_user_profile_with_account', {
    user_id_param: userId,
    user_email: email,
    account_id_param: accountId,
    is_first_user: isFirstUser,
    full_name_param: fullName || null,
  });

  if (error) {
    console.error('Error creating user profile:', error);
    throw new Error(`Failed to create user profile: ${error.message}`);
  }

  return data;
}

/**
 * Extracts the domain from an email address
 * @param email - Email address
 * @returns Domain portion of the email (everything after @)
 */
export function extractEmailDomain(email: string): string {
  const parts = email.toLowerCase().split('@');
  if (parts.length !== 2) {
    throw new Error('Invalid email address');
  }
  return parts[1];
}
