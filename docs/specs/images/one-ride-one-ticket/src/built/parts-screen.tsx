// The parts of spec 31 (3.3) on one screen, to look at them by eye beside
// the drawing of the parts. Not a screen of the app: it is copied into
// apps/mobile/src/app for the pictures and taken out again (../README.md).
import {
  Bell,
  CarFront,
  Check,
  Pencil,
  Share,
  Ticket,
  UserCheck,
  X,
  Zap,
} from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ActionRows } from "@/components/action-rows";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Grid } from "@/components/grid";
import { IconButton } from "@/components/icon-button";
import { NeedsYouCard } from "@/components/needs-you-card";
import { RideTicket, TicketFoot } from "@/components/ride-ticket";
import { Road } from "@/components/road";
import { Row } from "@/components/row";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { Tag } from "@/components/tag";
import { Heading } from "@/components/text";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

export default function Parts() {
  const palette = usePalette();
  const [open, setOpen] = useState(true);
  const [on, setOn] = useState(true);
  const name = (text: string) => (
    <Text style={[typography.label, { color: palette.text }]}>{text}</Text>
  );
  const muted = (text: string) => (
    <Text style={[typography.small, { color: palette.textMuted }]}>{text}</Text>
  );
  return (
    <Screen width="page">
      <ScreenHead
        title="Your ride to Vík"
        line="1 request needs your answer."
        action={<IconButton icon={Share} label="Share" onPress={() => undefined} />}
      />
      <Grid>
        <RideTicket
          day="Sat 28 Nov"
          tags={[{ label: "Book instantly", kind: "positive", icon: Zap }]}
          from={{ time: "10:00", place: "N1 Selfoss" }}
          to={{ time: "11:35", place: "N1 Vík" }}
          between="1 h 35 min"
          price={{ amount: "1,500 ISK", unit: "per seat" }}
          href="/about"
          accessibilityLabel="Selfoss to Vík"
          fill
          corner={<IconButton quiet icon={Share} label="Share" onPress={() => undefined} />}
          foot={
            <TicketFoot
              start={
                <>
                  <Avatar small firstName="Jón" colour={2} />
                  {name("Jón")}
                </>
              }
              end={muted("2 seats left")}
            />
          }
        />
        <RideTicket
          mine
          day="Sat 28 Nov"
          tags={[{ label: "Passenger", kind: "plain", icon: Ticket }]}
          from={{ time: "10:00", place: "N1 Selfoss" }}
          to={{ time: "11:35", place: "N1 Vík" }}
          between="1 h 35 min"
          price={{ amount: "1,500 ISK", unit: "1 seat" }}
          href="/about"
          accessibilityLabel="Selfoss to Vík"
          fill
          foot={
            <TicketFoot
              start={
                <>
                  <Avatar small firstName="Jón" colour={2} />
                  {name("Jón")}
                </>
              }
              end={<Tag kind="positive" label="Seat confirmed" icon={Check} />}
            />
          }
        />
        <RideTicket
          mine
          day="Fri 27 Nov"
          tags={[{ label: "You drive", kind: "plain", icon: CarFront }]}
          from={{ time: "18:30", place: "Kirkjubæjarklaustur, N1 við Klausturveg" }}
          to={{ time: "20:55", place: "N1 Vík" }}
          between="2 h 25 min, 5 stops"
          fill
          corner={<IconButton quiet icon={Share} label="Share" onPress={() => undefined} />}
          foot={<TicketFoot start={muted("1 of 3 seats taken")} end={muted("1 request")} />}
        />
        <RideTicket
          day="Fri 27 Nov"
          tags={[{ label: "Driver approves", kind: "info", icon: UserCheck }]}
          from={{
            time: "18:30",
            place: "Mjódd bus terminal",
            under: muted("1.3 km from Kringlan"),
          }}
          to={{ time: "20:55", place: "N1 Vík" }}
          between="2 h 25 min"
          price={{ amount: "Free", unit: "per seat" }}
          fill
        />
      </Grid>
      <Grid>
        <Card>
          <Road steps={["Asked", "Confirmed", "Trip day", "Done"]} current={1} />
        </Card>
        <Card>
          <Road steps={["Route", "Time", "Seats", "Price", "Check"]} current={2} />
        </Card>
        <Card>
          <Road steps={["Asked", "Confirmed", "Trip day", "Done"]} current={0} />
        </Card>
        <Card>
          <Road steps={["Leið", "Tími", "Sæti", "Verð", "Yfirfara"]} current={4} />
        </Card>
      </Grid>
      <ScreenHead
        title="Check and publish"
        line="This is how people will see your ride."
        road={<Road steps={["Route", "Time", "Seats", "Price", "Check"]} current={4} />}
      />
      <NeedsYouCard
        icon={Bell}
        title="Dóra asks for 1 seat"
        detail="Mjódd to Selfoss, Fri 27 Nov. 11 h left to answer."
        action={{ label: "See the request", onPress: () => undefined }}
      />
      <NeedsYouCard
        icon={Bell}
        title="Add a picture of yourself"
        action={{ label: "Add a picture", outlined: true, onPress: () => undefined }}
      />
      <NeedsYouCard>
        <View style={styles.request}>
          <Avatar firstName="Dóra" colour={1} />
          <Heading>Dóra</Heading>
        </View>
        <View style={styles.request}>
          <View style={styles.half}>
            <Button fill variant="secondary" label="Decline" onPress={() => undefined} />
          </View>
          <View style={styles.half}>
            <Button fill label="Accept" onPress={() => undefined} />
          </View>
        </View>
      </NeedsYouCard>
      <Grid>
        <ActionRows>
          <Row icon={Pencil} title="Edit the ride" onPress={() => undefined} />
          <Row icon={Share} title="Share this ride" value="Link" href="/about" />
          <Row
            title="Gunnar"
            value="1 seat"
            expanded={open}
            onToggle={() => {
              setOpen(!open);
            }}
          >
            {muted("Mjódd to Hella, 1 seat, 600 ISK")}
          </Row>
          <Row icon={Bell} title="New booking requests" switched={on} onSwitch={setOn} />
          <Row shows title="Phone" value="Confirmed" />
          <Row danger icon={X} title="Cancel the ride" onPress={() => undefined} />
        </ActionRows>
        <Card>
          <Row title="My cars" value="1" onPress={() => undefined} />
          <View style={styles.tags}>
            <Tag kind="positive" label="Confirmed" />
            <Tag kind="warning" label="Waiting for payment" />
            <Tag kind="info" label="Request sent" />
            <Tag kind="womenOnly" label="Women only" />
            <Tag kind="plain" label="Declined" />
            <Tag kind="problem" label="No-show" />
          </View>
        </Card>
      </Grid>
    </Screen>
  );
}

const styles = StyleSheet.create({
  request: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  half: { flex: 1 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
