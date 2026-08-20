/**
 * Loupe example app — dogfood target for react-native-loupe.
 *
 * @format
 */

import React from 'react';
import {
  Button,
  Linking,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {clearSeed, seedStorage} from './storage-seed';

// A GraphQL endpoint that really answers, so the panel can be judged against
// live traffic: a named query, a mutation, and the case that matters most —
// an operation that fails with HTTP 200 and an errors array.
async function fireGraphQL() {
  const post = (body: unknown) =>
    fetch('https://countries.trevorblades.com/', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    }).catch(() => {});

  await post({
    operationName: 'GetCountry',
    query: 'query GetCountry($code: ID!) { country(code: $code) { name capital currency } }',
    variables: {code: 'BR'},
  });
  await post({
    query: 'query ListContinents { continents { code name } }',
  });
  // 200 with errors: the failure a status code alone cannot show.
  await post({
    operationName: 'BadOperation',
    query: 'query BadOperation { thisFieldDoesNotExist { nope } }',
  });
}

async function fireRequests() {
  await fetch('https://jsonplaceholder.typicode.com/todos/1');
  await fetch('https://jsonplaceholder.typicode.com/posts', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({title: 'from Loupe example'}),
  });
  await fetch('https://jsonplaceholder.typicode.com/nope-404');
  await fetch('https://this-host-does-not-exist.invalid/x').catch(() => {});
}

function fireLogs() {
  console.log('a plain log', {user: 42});
  console.debug('a debug line');
  console.warn('a warning');
  console.error(new Error('a captured error'));
}

export default function App() {
  // Tracks the last deep link the app received, so a fired link is visibly
  // provable end to end rather than only appearing in Loupe's history.
  const [lastLink, setLastLink] = React.useState<string | null>(null);

  React.useEffect(() => {
    const sub = Linking.addEventListener('url', ({url}) => setLastLink(url));
    void Linking.getInitialURL().then(url => url && setLastLink(url));
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title}>Loupe example</Text>
        <Text style={styles.hint}>
          Tap the bubble, or shake the device, to open.
        </Text>
        {lastLink && <Text style={styles.hint}>last link: {lastLink}</Text>}
        <Button title="Fire network requests" onPress={fireRequests} />
        <Button title="Fire GraphQL" onPress={() => void fireGraphQL()} />
        <Button title="Write logs" onPress={fireLogs} />
        <Button title="Seed storage" onPress={() => void seedStorage()} />
        <Button title="Clear seeded keys" onPress={() => void clearSeed()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {flex: 1, justifyContent: 'center', gap: 16, padding: 24},
  title: {fontSize: 22, fontWeight: '600'},
  hint: {opacity: 0.6, marginBottom: 16},
});
