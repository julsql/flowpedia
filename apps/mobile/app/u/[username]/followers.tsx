import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import type { PublicUser } from "@flowpedia/shared";
import { AuthScaffold } from "../../../src/components/AuthScaffold";
import { UserList } from "../../../src/components/UserList";
import { fetchFollowers } from "../../../src/api/client";
import { useLocale } from "../../../src/i18n";

export default function FollowersScreen() {
  const { t } = useLocale();
  const params = useLocalSearchParams<{ username?: string }>();
  const username = String(params.username ?? "");
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchFollowers(username)
      .then((u) => active && (setUsers(u), setLoading(false)))
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [username]);

  return (
    <AuthScaffold title={t("social.followers")}>
      <UserList users={users} loading={loading} emptyText={t("social.noFollowers")} />
    </AuthScaffold>
  );
}
