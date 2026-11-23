import type { CallFailure } from "@shareride/api-client";
import {
  addSignInMethodRoute,
  listSignInMethodsRoute,
  prepareSignInMethodRoute,
  removePasswordRoute,
  removeSignInMethodRoute,
  type MemberPasskey,
  type PasswordState,
  type SignInMethod,
} from "@shareride/contracts";
import {
  formatPhoneNumber,
  isAppleRelay,
  signInProviders,
  type SignInProvider,
} from "@shareride/domain";
import { formatDate, type Translate } from "@shareride/i18n";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { errorText } from "@/auth/errors";
import { useMe, useSession } from "@/auth/session";
import { useConfig } from "@/beta/config";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Loading } from "@/components/loading";
import { Notice } from "@/components/notice";
import { Screen } from "@/components/screen";
import { TakesFocus } from "@/components/takes-focus";
import { Body, Title } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { useLoaded } from "@/lib/use-loaded";
import { BackToMenu } from "@/navigation/back-to-menu";
import { ConfirmWithCode } from "@/privacy/confirm-with-code";
import { PasskeyDevices } from "@/sign-in/passkey-devices";
import { providerNames, useProviderWindow } from "@/sign-in/provider-window";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/** A line of the list that can be changed here: Google, Apple or the password. */
type Changeable = SignInProvider | "password";

/** A Google or Apple account checked and waiting for the confirm code. */
interface Adding {
  readonly pendingSignIn: string;
  readonly provider: SignInProvider;
}

/** What a refusal to add a Google or Apple account says. */
function refusalText(t: Translate, failure: CallFailure, provider: string): string {
  switch (failure.error.code) {
    case "provider_in_use":
      return t("auth.provider.inUse", { provider });
    case "provider_expired":
      return t("settings.signInMethods.expired", { provider });
    case "provider_already_linked":
      return t("settings.signInMethods.alreadyLinked", { provider });
    case "ticket_invalid":
      return t("settings.signInMethods.failed", { provider });
    default:
      return errorText(t, failure);
  }
}

/**
 * Settings, Sign-in methods (spec 19, 3.4; spec 26, 3.8; spec 27, 3.6): the
 * phone number, which stays, the email, which signs in and can be changed,
 * Google and Apple, each linked with its email or not linked, and the
 * password, set on a day or not set, which Choose a password adds or
 * changes and which is removed here after asking, and Face ID or
 * fingerprint, one line per device (`PasskeyDevices`). Adding
 * one opens its window, checks it can be added, then asks for a confirm
 * code, as downloading the data does (R19.3): by email to the verified
 * email, else by text to the account's own number (spec 26, 3.6).
 * Removing one asks first; sessions stay signed in. After a change the list
 * shows it at once and is loaded again; a list that fails to load then
 * stays as it was.
 */
export default function SignInMethodsScreen() {
  const me = useMe();
  if (me === null) return <BackToMenu />;
  return <SignInMethods phoneNumber={me.phoneNumber} email={me.email} />;
}

function SignInMethods({
  phoneNumber,
  email,
}: {
  readonly phoneNumber: string | null;
  readonly email: string | null;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const session = useSession();
  const config = useConfig();
  const providerWindow = useProviderWindow();
  const load = useCallback(() => session.call(listSignInMethodsRoute, {}), [session]);
  const { value: answer, reload } = useLoaded(load);
  // The list as changed here, over the one first loaded.
  const [changed, setChanged] = useState<readonly SignInMethod[] | null>(null);
  // The password as changed here or loaded again; undefined while as first loaded.
  const [changedPassword, setChangedPassword] = useState<PasswordState | null | undefined>();
  // The devices as changed here or loaded again; undefined while as first loaded.
  const [changedPasskeys, setChangedPasskeys] = useState<readonly MemberPasskey[] | undefined>();
  const [busy, setBusy] = useState<Changeable | null>(null);
  const [asking, setAsking] = useState<Changeable | null>(null);
  const [adding, setAdding] = useState<Adding | null>(null);
  // When a new confirm code can be asked for, kept while the form closes and opens.
  const [sentUntil, setSentUntil] = useState(0);
  // The question or form that just closed: its button takes focus back.
  const [closed, setClosed] = useState<Changeable | null>(null);
  // Counted, so each outcome takes focus anew: the button pressed may be gone.
  const [outcome, setOutcome] = useState<{
    text: string;
    failed: boolean;
    count: number;
  } | null>(null);

  function tell(text: string, failed: boolean) {
    setClosed(null);
    setOutcome((last) => ({ text, failed, count: (last?.count ?? 0) + 1 }));
  }

  /** Loads the list again; if that fails, the list stays as it was. */
  const refresh = useCallback(async () => {
    const result = await session.call(listSignInMethodsRoute, {});
    if (result.ok) {
      setChanged(result.data.methods);
      setChangedPassword(result.data.password ?? null);
      setChangedPasskeys(result.data.passkeys);
    }
  }, [session]);

  // Back from Choose a password: the password's line shows what changed.
  const shownBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (shownBefore.current) void refresh();
      shownBefore.current = true;
    }, [refresh]),
  );

  /** Opens the window in the tap itself, then checks the account can be added. */
  async function add(provider: SignInProvider) {
    setOutcome(null);
    setClosed(null);
    setAsking(null);
    setBusy(provider);
    const opened = providerWindow.open(provider);
    const name = providerNames[provider];
    const back = await opened;
    if (back.kind !== "ticket") {
      setBusy(null);
      if (back.kind === "expired")
        tell(t("settings.signInMethods.expired", { provider: name }), true);
      if (back.kind === "failed")
        tell(t("settings.signInMethods.failed", { provider: name }), true);
      return;
    }
    const prepared = await session.call(prepareSignInMethodRoute, {
      body: { ticket: back.ticket, verifier: back.verifier },
    });
    setBusy(null);
    if (!prepared.ok) {
      // Another device may have added it meanwhile: that is no failure.
      const already = prepared.error.code === "provider_already_linked";
      tell(refusalText(t, prepared, name), !already);
      if (already) void refresh();
      return;
    }
    setAdding({ pendingSignIn: prepared.data.pendingSignIn, provider: prepared.data.provider });
  }

  async function confirmAdding(code: string): Promise<{ readonly ok: true } | CallFailure> {
    if (adding === null) return { ok: true };
    const name = providerNames[adding.provider];
    const result = await session.call(addSignInMethodRoute, {
      body: { pendingSignIn: adding.pendingSignIn, code },
    });
    if (result.ok) {
      const added = result.data;
      setAdding(null);
      // The code is used up: the next one is sent at once.
      setSentUntil(0);
      tell(t("auth.provider.linked", { provider: name }), false);
      setChanged((before) => [
        ...(before ?? methodsOf(answer)).filter((method) => method.provider !== added.provider),
        added,
      ]);
      // Linking may have given the account its email (R19.4).
      void session.reloadMe();
      void refresh();
      return { ok: true };
    }
    // The code is right but the account cannot be added: the form closes.
    // A wrong code stays in the form, which says so.
    const { code: refused } = result.error;
    if (
      refused === "provider_expired" ||
      refused === "provider_in_use" ||
      refused === "provider_already_linked"
    ) {
      setAdding(null);
      tell(refusalText(t, result, name), true);
      void refresh();
    }
    return result;
  }

  async function remove(provider: SignInProvider) {
    setBusy(provider);
    const result = await session.call(removeSignInMethodRoute, { params: { provider } });
    setBusy(null);
    setAsking(null);
    const name = providerNames[provider];
    if (result.ok || result.error.code === "not_found") {
      tell(t("settings.signInMethods.removed", { provider: name }), false);
      setChanged((before) =>
        (before ?? methodsOf(answer)).filter((method) => method.provider !== provider),
      );
      void refresh();
      return;
    }
    tell(errorText(t, result), true);
  }

  async function removePassword() {
    setBusy("password");
    const result = await session.call(removePasswordRoute, {});
    setBusy(null);
    setAsking(null);
    if (result.ok || result.error.code === "not_found") {
      tell(t("settings.signInMethods.passwordRemoved"), false);
      setChangedPassword(null);
      void refresh();
      return;
    }
    tell(errorText(t, result), true);
  }

  const header = (
    <>
      <BackButton fallback="/settings" />
      <Title>{t("settings.signInMethods")}</Title>
      <Body>{t("settings.signInMethods.help")}</Body>
    </>
  );
  const methods = changed ?? methodsOf(answer);
  const password =
    changedPassword === undefined
      ? answer?.ok === true
        ? (answer.data.password ?? null)
        : null
      : changedPassword;
  const passkeys = changedPasskeys ?? (answer?.ok === true ? answer.data.passkeys : []);
  if (answer === undefined && changed === null) {
    return (
      <Screen>
        {header}
        <Loading />
      </Screen>
    );
  }
  if (answer?.ok === false && changed === null) {
    return (
      <Screen>
        {header}
        <Notice message={errorText(t, answer)} />
        <Button variant="secondary" label={t("common.retry")} onPress={reload} />
      </Screen>
    );
  }

  const linked = new Map<SignInProvider, SignInMethod>(
    methods.map((method) => [method.provider, method]),
  );
  // Linked meanwhile, such as from another device: the form has no more to do.
  const confirming = adding !== null && !linked.has(adding.provider) ? adding : null;
  // A provider shows when it is set up, or still linked from before.
  const shown = signInProviders.filter(
    (provider) => config.signInProviders.includes(provider) || linked.has(provider),
  );
  const label = (text: string) => (
    <Text style={[typography.bodyStrong, { color: palette.text }]}>{text}</Text>
  );

  return (
    <Screen>
      {header}
      {outcome === null ? null : (
        <TakesFocus key={outcome.count}>
          <Notice
            kind={outcome.failed ? "error" : "info"}
            urgent={outcome.failed}
            message={outcome.text}
          />
        </TakesFocus>
      )}
      <Card>
        <View style={styles.list}>
          {phoneNumber === null ? null : (
            <View style={styles.method}>
              {label(t("profile.phone"))}
              <Body align="start">{formatPhoneNumber(phoneNumber)}</Body>
            </View>
          )}
          <View style={styles.method}>
            {label(t("settings.email"))}
            <Body align="start">{email ?? t("settings.signInMethods.noEmail")}</Body>
            <Button
              variant="secondary"
              label={t(
                email === null
                  ? "settings.signInMethods.addEmail"
                  : "settings.signInMethods.changeEmail",
              )}
              onPress={() => {
                router.push("/settings/email");
              }}
            />
          </View>
          {shown.map((provider) => {
            const name = providerNames[provider];
            const method = linked.get(provider);
            const canAdd = config.signInProviders.includes(provider);
            return (
              <View key={provider} style={styles.method}>
                {label(name)}
                <Body align="start">{describeMethod(t, provider, method)}</Body>
                {method === undefined ? (
                  canAdd && confirming === null ? (
                    <TakesFocus when={closed === provider}>
                      <Button
                        variant="secondary"
                        label={t("settings.signInMethods.add", { provider: name })}
                        busy={busy === provider}
                        disabled={(busy !== null && busy !== provider) || !providerWindow.ready}
                        onPress={() => void add(provider)}
                      />
                    </TakesFocus>
                  ) : null
                ) : asking === provider ? (
                  <TakesFocus>
                    <View style={styles.question}>
                      <Body align="start">
                        {t("settings.signInMethods.removeQuestion", { provider: name })}
                      </Body>
                      <Button
                        label={t("settings.signInMethods.remove", { provider: name })}
                        busy={busy === provider}
                        onPress={() => void remove(provider)}
                      />
                      <Button
                        variant="text"
                        label={t("common.cancel")}
                        disabled={busy === provider}
                        onPress={() => {
                          setAsking(null);
                          setClosed(provider);
                        }}
                      />
                    </View>
                  </TakesFocus>
                ) : (
                  <TakesFocus when={closed === provider}>
                    <Button
                      variant="secondary"
                      label={t("settings.signInMethods.remove", { provider: name })}
                      disabled={busy !== null}
                      onPress={() => {
                        setOutcome(null);
                        setClosed(null);
                        setAsking(provider);
                      }}
                    />
                  </TakesFocus>
                )}
              </View>
            );
          })}
          <View style={styles.method}>
            {label(t("auth.password"))}
            {email === null ? (
              <Body align="start">{t("password.emailRequired")}</Body>
            ) : (
              <PasswordLine
                setAt={password?.setAt ?? null}
                asking={asking === "password"}
                busy={busy === "password"}
                disabled={busy !== null}
                takeFocus={closed === "password"}
                onAsk={() => {
                  setOutcome(null);
                  setClosed(null);
                  setAsking("password");
                }}
                onRemove={() => void removePassword()}
                onCancel={() => {
                  setAsking(null);
                  setClosed("password");
                }}
              />
            )}
          </View>
          <PasskeyDevices
            passkeys={passkeys}
            onSaved={(passkey) => {
              setChangedPasskeys([...passkeys.filter((kept) => kept.id !== passkey.id), passkey]);
              void refresh();
            }}
            onRemoved={(id) => {
              setChangedPasskeys(passkeys.filter((kept) => kept.id !== id));
              void refresh();
            }}
            onChanged={() => void refresh()}
            tell={tell}
            clearOutcome={() => {
              setOutcome(null);
              setClosed(null);
            }}
          />
        </View>
      </Card>
      {/* The code field takes focus itself, as in Download my data. */}
      {confirming === null ? null : (
        <View style={styles.form}>
          <Body align="start">
            {t("settings.signInMethods.confirm", { provider: providerNames[confirming.provider] })}
          </Body>
          <ConfirmWithCode
            confirmLabel={t("settings.signInMethods.add", {
              provider: providerNames[confirming.provider],
            })}
            onConfirm={confirmAdding}
            sentUntil={sentUntil}
            onSent={setSentUntil}
            onCancel={() => {
              setAdding(null);
              setClosed(confirming.provider);
            }}
          />
        </View>
      )}
    </Screen>
  );
}

/**
 * The password's line: set on a day, with Change and Remove, which asks
 * first; or not set, with Add. Choose a password adds or changes it.
 */
function PasswordLine({
  setAt,
  asking,
  busy,
  disabled,
  takeFocus,
  onAsk,
  onRemove,
  onCancel,
}: {
  readonly setAt: string | null;
  readonly asking: boolean;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly takeFocus: boolean;
  readonly onAsk: () => void;
  readonly onRemove: () => void;
  readonly onCancel: () => void;
}) {
  const { locale, t } = useLanguage();
  const choose = () => {
    router.push("/settings/password");
  };
  if (setAt === null) {
    return (
      <>
        <Body align="start">{t("settings.signInMethods.passwordNotSet")}</Body>
        <TakesFocus when={takeFocus}>
          <Button
            variant="secondary"
            label={t("settings.signInMethods.addPassword")}
            disabled={disabled}
            onPress={choose}
          />
        </TakesFocus>
      </>
    );
  }
  // Iceland keeps UTC all year, so the moment's date is Iceland's.
  const date = formatDate(setAt.slice(0, 10), locale);
  return (
    <>
      <Body align="start">{t("settings.signInMethods.passwordSet", { date })}</Body>
      {asking ? (
        <TakesFocus>
          <View style={styles.question}>
            <Body align="start">{t("settings.signInMethods.removePasswordQuestion")}</Body>
            <Button
              label={t("settings.signInMethods.removePassword")}
              busy={busy}
              onPress={onRemove}
            />
            <Button variant="text" label={t("common.cancel")} disabled={busy} onPress={onCancel} />
          </View>
        </TakesFocus>
      ) : (
        <View style={styles.question}>
          <Button
            variant="secondary"
            label={t("settings.signInMethods.changePassword")}
            disabled={disabled}
            onPress={choose}
          />
          <TakesFocus when={takeFocus}>
            <Button
              variant="secondary"
              label={t("settings.signInMethods.removePassword")}
              disabled={disabled}
              onPress={onAsk}
            />
          </TakesFocus>
        </View>
      )}
    </>
  );
}

/** The methods in the list first loaded, or none before it comes. */
function methodsOf(
  answer:
    | { readonly ok: true; readonly data: { readonly methods: readonly SignInMethod[] } }
    | { readonly ok: false }
    | undefined,
): readonly SignInMethod[] {
  return answer?.ok === true ? answer.data.methods : [];
}

/** The linked account's email, "Linked" without one, or "Not linked". */
function describeMethod(
  t: Translate,
  provider: SignInProvider,
  method: SignInMethod | undefined,
): string {
  if (method === undefined) return t("settings.signInMethods.notLinked");
  const { email } = method;
  if (provider === "apple" && (email === null || isAppleRelay(email))) {
    return t("settings.signInMethods.hiddenEmail");
  }
  return email ?? t("settings.signInMethods.linked");
}

const styles = StyleSheet.create({
  list: { gap: spacing.lg },
  method: { gap: spacing.xs, alignItems: "flex-start" },
  question: { gap: spacing.sm, alignItems: "flex-start" },
  form: { gap: spacing.md },
});
