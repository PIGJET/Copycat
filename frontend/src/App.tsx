
import { useState } from "react";
import { HomePage, LobbyPage } from "./components/Game";

type Page = "home" | "lobby";

function App() {
  const [page, setPage] = useState<Page>("home");

  if (page === "lobby") {
    return (
      <LobbyPage
        onBack={() => setPage("home")}
        onStart={(players, format) => {
          // Save these in game state, then move to the next page.
          console.log(players, format);
        }}
      />
    );
  }

  return (
    <HomePage
      onSolo={() => {
        // Set up solo game state, then move to camera or tempo setup.
      }}
      onTeam={() => setPage("lobby")}
    />
  );
}

export default App;
