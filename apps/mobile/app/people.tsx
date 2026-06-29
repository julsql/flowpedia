import { useEffect, useState } from "react";
import type { PublicUser } from "@flowpedia/shared";
import { AuthScaffold } from "../src/components/AuthScaffold";
import { FormField } from "../src/components/FormField";
import { UserList } from "../src/components/UserList";
import { searchUsers } from "../src/api/client";
import { useLocale } from "../src/i18n";

export default function PeopleScreen() {
  const { t } = useLocale();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Debounced username/name search.
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setUsers([]);
      setSearched(false);
      return;
    }
    let active = true;
    setLoading(true);
    const handle = setTimeout(() => {
      searchUsers(term)
        .then((u) => active && (setUsers(u), setSearched(true), setLoading(false)))
        .catch(() => active && setLoading(false));
    }, 300);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [q]);

  return (
    <AuthScaffold title={t("social.findPeople")}>
      <FormField
        label={t("social.searchPeople")}
        value={q}
        onChangeText={setQ}
        autoCapitalize="none"
        returnKeyType="search"
      />
      <UserList users={users} loading={loading} emptyText={searched ? t("social.noUsers") : ""} />
    </AuthScaffold>
  );
}
