import { useState } from "react";
import { AppLayout } from "./components/AppLayout";
import { demoCard, demoProfile, type Profile } from "./demo";
import {
  hasMemberBackend,
  clearMemberSession,
  requestMember,
  type MemberAccount,
  type MemberResult,
  type Registration,
} from "./memberApi";
import { goBackTo, navigate, usePage } from "./navigation";
import { BalancePage } from "./pages/BalancePage";
import { ProfilePage } from "./pages/ProfilePage";
import { RegistrationPage } from "./pages/RegistrationPage";
import { UnregisteredPage } from "./pages/UnregisteredPage";
import { WelcomePage, type DemoScenario } from "./pages/WelcomePage";
import { getZaloMemberCredentials, isZaloTesting } from "./zaloTesting";

export function App() {
  const [scenario, setScenario] = useState<DemoScenario>("returning");
  const [declined, setDeclined] = useState(false);
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
    page === "welcome" ||
    (session === "unregistered" &&
      (page === "unregistered" || page === "register")) ||
    (session === "member" && (page === "balance" || page === "profile"))
      ? page
      : "welcome";
  const card = accounts[accountIndex];

  function showMember(result: MemberResult) {
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
    navigate("balance", activePage === "register");
  }

  async function signIn() {
    setDeclined(scenario === "declined" && !hasMemberBackend);
    if (scenario === "declined" && !hasMemberBackend) return;
    setCheckingZalo(true);
    setZaloError("");
    try {
      if (hasMemberBackend) {
        showMember(await requestMember("lookup"));
        return;
      }
      if (isZaloTesting) await getZaloMemberCredentials();
      if (scenario === "new")
        showMember({ registered: false, phone: demoProfile.phone });
      else
        showMember({
          registered: true,
          profile: demoProfile,
          accounts: [{ ...demoCard, shopId: 1 }],
        });
    } catch (error) {
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
          declined={declined}
          zaloError={zaloError}
          signIn={signIn}
        />
      )}
      {activePage === "unregistered" && (
        <UnregisteredPage
          phone={profile.phone}
          onBack={signOut}
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
