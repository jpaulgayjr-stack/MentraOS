import {AsyncResult, result as Res, Result} from "typesafe-ts"

// Type only: this file must not load authClient.ts, which loads this one.
import type {AuthClient} from "@/utils/auth/authClient"
import type {
  ConfirmLinkSignIn,
  LinkSignInResult,
  MentraAuthSession,
  MentraAuthUser,
  MentraSigninResponse,
} from "@/utils/auth/authProvider.types"
import {LOCAL_SESSION_MARKER, LOCAL_USER_ID} from "@/utils/auth/localUser"

/**
 * AD Glass: the person holding the phone is the only user. Nothing here talks
 * to a server; there is no account to sign in to, change or delete.
 * See docs/ad-glass/spec-phase2.md.
 */

const LOCAL_USER: MentraAuthUser = Object.freeze({id: LOCAL_USER_ID, name: "AD Glass", provider: "local"})

function localSession(): MentraAuthSession {
  return {token: LOCAL_SESSION_MARKER, user: {...LOCAL_USER}}
}

/** Every account operation: there is no account service to perform it. */
function noAccountService<T>(operation: string): AsyncResult<T, Error> {
  return Res.error_async(new Error(`AD Glass has no account service (${operation})`))
}

function nothingToDo(): AsyncResult<void, Error> {
  return Res.try_async(async () => {})
}

export class LocalAuthProvider implements AuthClient {
  /** The local user never signs in or out, so the callback never fires. */
  public onAuthStateChange(_callback: (event: string, session: MentraAuthSession) => void): Result<any, Error> {
    return Res.ok({unsubscribe: () => {}})
  }

  public getUser(): AsyncResult<MentraAuthUser, Error> {
    return Res.try_async(async () => ({...LOCAL_USER}))
  }

  public getSession(): AsyncResult<MentraAuthSession, Error> {
    return Res.try_async(async () => localSession())
  }

  public startAutoRefresh(): AsyncResult<void, Error> {
    return nothingToDo()
  }

  public stopAutoRefresh(): AsyncResult<void, Error> {
    return nothingToDo()
  }

  /** Nothing to sign out of. A success, so a stale caller cannot strand the app on an error. */
  public signOut(): AsyncResult<void, Error> {
    return nothingToDo()
  }

  /** There is no server to exchange a token with, so there is no token. */
  public getSubjectToken(): AsyncResult<{token: string; type: string}, Error> {
    return noAccountService("subject token")
  }

  public signUp(_params: {email: string; password: string}): AsyncResult<MentraSigninResponse, Error> {
    return noAccountService("sign up")
  }

  public resendSignupEmail(_email: string): AsyncResult<void, Error> {
    return noAccountService("resend sign-up email")
  }

  public completeSignupVerification(
    _accessToken: string,
    _confirm: ConfirmLinkSignIn,
  ): AsyncResult<LinkSignInResult, Error> {
    return noAccountService("sign-up verification")
  }

  public signInWithPassword(_params: {email: string; password: string}): AsyncResult<MentraSigninResponse, Error> {
    return noAccountService("sign in")
  }

  public resetPasswordForEmail(_email: string): AsyncResult<void, Error> {
    return noAccountService("password reset")
  }

  public resetPasswordByCode(_email: string, _code: string, _newPassword: string): AsyncResult<void, Error> {
    return noAccountService("password reset")
  }

  public updateUserPassword(_password: string, _currentPassword?: string): AsyncResult<void, Error> {
    return noAccountService("password change")
  }

  public updateUserEmail(_email: string, _password?: string): AsyncResult<void, Error> {
    return noAccountService("email change")
  }

  public confirmEmailChange(_code: string): AsyncResult<void, Error> {
    return noAccountService("email change")
  }

  public requestAccountDeletion(): AsyncResult<void, Error> {
    return noAccountService("account deletion")
  }

  public confirmAccountDeletion(_code: string): AsyncResult<void, Error> {
    return noAccountService("account deletion")
  }

  public appleSignIn(): AsyncResult<string, Error> {
    return noAccountService("Apple sign-in")
  }

  public googleSignIn(): AsyncResult<string, Error> {
    return noAccountService("Google sign-in")
  }

  public completeOAuthHandoff(_params: {code: string; state: string}): AsyncResult<void, Error> {
    return noAccountService("OAuth sign-in")
  }
}
