import { PushService } from './push.service';
import { UsersService } from './users.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';

const TOKEN = 'ExponentPushToken[FlacronCVTestToken0001]';

function makeService() {
  const firestore = new InMemoryFirestore();
  const users = new UsersService({ firestore } as never);
  const push = new PushService(users);
  return { firestore, users, push };
}

describe('PushService', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('does not send when the preference is off', async () => {
    const { users, push } = makeService();
    await users.create({ uid: 'u1', email: 'a@b.com', displayName: 'A', photoURL: null });
    await users.addPushToken('u1', TOKEN);

    await push.sendToUser('u1', { title: 'Hi', body: 'There' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not send when there are no tokens', async () => {
    const { users, push } = makeService();
    await users.create({ uid: 'u2', email: 'a@b.com', displayName: 'A', photoURL: null });
    await users.update('u2', { preferences: { pushNotifications: true } });

    await push.sendToUser('u2', { title: 'Hi', body: 'There' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not send to a soft-deleted account', async () => {
    const { firestore, users, push } = makeService();
    await users.create({ uid: 'u3', email: 'a@b.com', displayName: 'A', photoURL: null });
    await users.update('u3', { preferences: { pushNotifications: true } });
    await users.addPushToken('u3', TOKEN);
    await firestore.collection('users').doc('u3').update({ isActive: false, deletedAt: new Date() });

    await push.sendToUser('u3', { title: 'Hi', body: 'There' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to Expo Push Service when opted in with a token', async () => {
    const { users, push } = makeService();
    await users.create({ uid: 'u4', email: 'a@b.com', displayName: 'A', photoURL: null });
    await users.update('u4', { preferences: { pushNotifications: true } });
    await users.addPushToken('u4', TOKEN);

    await push.sendToUser('u4', { title: 'Hi', body: 'There', data: { screen: 'support' } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    const payload = JSON.parse(String(init.body));
    expect(payload).toEqual([
      {
        to: TOKEN,
        title: 'Hi',
        body: 'There',
        sound: 'default',
        data: { screen: 'support' },
      },
    ]);
  });
});
