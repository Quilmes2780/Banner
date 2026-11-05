import { useState } from 'react';
import { createGame } from '../engine/setup';
import type { GameState, PlayerId, PlayerSetup } from '../engine/types';
import { clearSave, loadGame } from './save';
import { CombatTestScreen } from './screens/CombatTestScreen';
import { GameScreen } from './screens/GameScreen';
import { MenuScreen } from './screens/MenuScreen';

type Route = { name: 'menu' } | { name: 'combatTest' } | { name: 'game'; state: GameState; viewer: PlayerId; key: number };

function firstHuman(state: GameState): PlayerId {
  const start = state.order.find(id => state.players[id].control === 'human');
  return start ?? state.order[0];
}

export function App() {
  const [route, setRoute] = useState<Route>({ name: 'menu' });
  const [saveVersion, setSaveVersion] = useState(0);
  const save = route.name === 'menu' ? loadGame() : null;

  if (route.name === 'combatTest') return <CombatTestScreen onBack={() => setRoute({ name: 'menu' })} />;
  if (route.name === 'game') {
    return (
      <GameScreen key={route.key} initial={route.state} initialViewer={route.viewer}
        onExit={() => { setRoute({ name: 'menu' }); setSaveVersion(v => v + 1); }} />
    );
  }
  return (
    <MenuScreen
      key={saveVersion}
      hasSave={!!save && save.state.phase !== 'ended'}
      onContinue={() => { if (save) setRoute({ name: 'game', state: save.state, viewer: save.viewer, key: Date.now() }); }}
      onStart={(seed: number, setups: PlayerSetup[]) => {
        clearSave();
        const state = createGame(seed, setups);
        setRoute({ name: 'game', state, viewer: firstHuman(state), key: Date.now() });
      }}
      onCombatTest={() => setRoute({ name: 'combatTest' })}
    />
  );
}
