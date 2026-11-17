import { useCallback, useEffect, useState } from "react";
import { AppLayout } from "./components/AppLayout";
import { demoCard, demoProfile, type Profile } from "./demo";
import {
  authenticateMember,
  hasMemberBackend,
  linkMember,
  MemberApiError,
  clearMemberSession,
  requestMember,
  type MemberAccount,
  type MemberResult,
  type Registration,
} from "./memberApi";
import { goBackTo, navigate, readPage, usePage } from "./navigation";
import { BalancePage } from "./pages/BalancePage";
import { ProfilePage } from "./pages/ProfilePage";
import { RegistrationPage } from "./pages/RegistrationPage";
import { UnregisteredPage } from "./pages/UnregisteredPage";
import { WelcomePage, type DemoScenario } from "./pages/WelcomePage";
import { getZaloPhoneToken, isZaloTesting } from "./zaloTesting";

export function App() {
  const [scenario, setScenario] = useState<DemoScenario>("returning");
  const [declined, setDeclined] = useState(false);
  const [zaloReady, setZaloReady] = useState(false);
  const [authenticating, setAuthenticating] = useState(hasMemberBackend);
  const [checkingZalo, setCheckingZalo] = useState(false);
  const [zaloError, setZaloError] = useState("");
  const [profile, setProfile] = useState(demoProfile);
  const [accounts, setAccounts] = useState<MemberAccount[]>([]);
  const [justRegistered, setJustRegistered] = useState(false);
  const [accountIndex, setAccountIndex] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const [session, setSession] = useState<"guest" | "unregistered" | "member">(
    "guest",
  );
  const page = usePage();
  const activePage =
    page === "welcome" && session === "member" ? "balance" :
    page === "welcome" && session === "unregistered" ? "unregistered" :
    page === "welcome" ||
    (session === "unregistered" &&
      (page === "unregistered" || page === "register")) ||
    (session === "member" && (page === "balance" || page === "profile"))
      ? page
      : "welcome";
  const card = accounts[accountIndex];

  const showMember = useCallback((result: MemberResult) => {
    if (!result.registered) {
      setProfile({ name: "", email: "", phone: result.phone });
      setSession("unregistered");
      navigate("unregistered");
      return;
    }
    setProfile(result.profile);
    setAccounts(result.accounts);
    setAccountIndex(0);
    setUpdatedAt(new Date());
    setSession("member");
    navigate("balance", readPage() === "register");
  }, []);

  const authenticate = useCallback(async (signal?: AbortSignal) => {
    setAuthenticating(true);
    setZaloReady(false);
    setZaloError("");
    try {
      const member = await authenticateMember(signal);
      if (signal?.aborted) return;
      setZaloReady(true);
      if (member) showMember(member);
    } catch (error) {
      if (!signal?.aborted)
        setZaloError(error instanceof Error ? error.message : "Chưa xác thực được tài khoản.");
    } finally {
      if (!signal?.aborted) setAuthenticating(false);
    }
  }, [showMember]);

  useEffect(() => {
    if (!hasMemberBackend) return;
    const controller = new AbortController();
    void authenticate(controller.signal);
    return () => controller.abort();
  }, [authenticate]);

  async function connectMember() {
    if (hasMemberBackend && !zaloReady) {
      await authenticate();
      return;
    }
    setDeclined(scenario === "declined" && !hasMemberBackend);
    if (scenario === "declined" && !hasMemberBackend) return;
    setCheckingZalo(true);
    setZaloError("");
    try {
      if (hasMemberBackend) {
        showMember(await linkMember());
        return;
      }
      if (isZaloTesting) await getZaloPhoneToken();
      if (scenario === "new")
        showMember({ registered: false, phone: demoProfile.phone });
      else
        showMember({
          registered: true,
          profile: demoProfile,
          accounts: [{ ...demoCard, shopId: 1 }],
        });
    } catch (error) {
      if (error instanceof MemberApiError &&
          (error.code === "SESSION_EXPIRED" || error.code === "SESSION_REVOKED" || error.code === "ZALO_NOT_VERIFIED")) {
        setZaloReady(false);
      }
      setZaloError(
        error instanceof Error
          ? error.message
          : "Chưa tra cứu được hồ sơ. Vui lòng thử lại.",
      );
    } finally {
      setCheckingZalo(false);
    }
  }

  async function registerMember(details: Registration) {
    if (hasMemberBackend) {
      const result = await requestMember("register", details, profile.phone);
      if (!result.registered) throw new Error("Chưa xác nhận được hồ sơ mới.");
      showMember(result);
      setJustRegistered(true);
      return;
    }
    showMember({
      registered: true,
      profile: {
        ...details,
        email: details.email ?? "",
        phone: profile.phone,
      },
      accounts: [],
    });
    setJustRegistered(true);
  }

  function signOut() {
    clearMemberSession();
    setZaloReady(false);
    setScenario("returning");
    setDeclined(false);
    setZaloError("");
    setProfile(demoProfile);
    setAccounts([]);
    setJustRegistered(false);
    setAccountIndex(0);
    setUpdatedAt(null);
    setSession("guest");
    navigate("welcome", true);
  }

  async function saveProfile(nextProfile: Profile) {
    if (hasMemberBackend) {
      const result = await requestMember(
        "profile",
        {
          name: nextProfile.name,
          email: nextProfile.email,
          birthday: nextProfile.birthday,
          sex: nextProfile.sex,
        },
        nextProfile.phone,
      );
      if (!result.registered)
        throw new Error("Chưa tìm thấy hồ sơ thành viên.");
      setProfile(result.profile);
      return;
    }
    setProfile(nextProfile);
  }

  return (
    <AppLayout screen={activePage}>
      {activePage === "welcome" && (
        <WelcomePage
          scenario={scenario}
          setScenario={(value) => {
            setScenario(value);
            setDeclined(false);
          }}
          checkingZalo={checkingZalo}
          authenticating={authenticating}
          zaloReady={zaloReady}
          declined={declined}
          zaloError={zaloError}
          connectMember={connectMember}
        />
      )}
      {activePage === "unregistered" && (
        <UnregisteredPage
          phone={profile.phone}
          onBack={() => {
            signOut();
            if (hasMemberBackend) void authenticate();
          }}
          onRegister={() => navigate("register")}
        />
      )}
      {activePage === "register" && (
        <RegistrationPage
          phone={profile.phone}
          onBack={() => goBackTo("unregistered")}
          onRegister={registerMember}
        />
      )}
      {activePage === "balance" && (
        <BalancePage
          profile={profile}
          accounts={accounts}
          accountIndex={accountIndex}
          setAccountIndex={setAccountIndex}
          justRegistered={justRegistered}
          updatedAt={updatedAt}
          onProfile={() => navigate("profile")}
          signOut={signOut}
        />
      )}
      {activePage === "profile" && (
        <ProfilePage
          profile={profile}
          level={card?.level}
          empty={justRegistered || accounts.length === 0}
          onBack={() => goBackTo("balance")}
          saveProfile={saveProfile}
        />
      )}
    </AppLayout>
  );
}
