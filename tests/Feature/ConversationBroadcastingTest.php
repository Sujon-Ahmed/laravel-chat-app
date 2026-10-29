<?php

use App\Events\ConversationUpdated;
use App\Events\MessageSent;
use App\Models\User;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

beforeEach(function () {
    // Broadcast channels are registered against the boot-time default connection,
    // which is "null" in tests, so register them on the connection used here to
    // authenticate private channels.
    config([
        'broadcasting.default' => 'pusher',
        'broadcasting.connections.pusher.key' => 'test-key',
        'broadcasting.connections.pusher.secret' => 'test-secret',
        'broadcasting.connections.pusher.app_id' => '123456',
        'broadcasting.connections.pusher.options.cluster' => 'mt1',
    ]);

    require base_path('routes/channels.php');
});

test('the message sent event broadcasts the message on the private conversation channel', function () {
    $sender = User::factory()->create();
    $conversation = directConversation($sender, User::factory()->create());

    $message = $conversation->messages()->create([
        'sender_id' => $sender->id,
        'body' => 'Hello there',
    ]);

    $event = new MessageSent($message);
    $channels = $event->broadcastOn();

    expect($event)->toBeInstanceOf(ShouldBroadcast::class)
        ->and($event)->not->toBeInstanceOf(ShouldBroadcastNow::class)
        ->and($channels)->toHaveCount(1)
        ->and($channels[0])->toBeInstanceOf(PrivateChannel::class)
        ->and($channels[0]->name)->toBe("private-conversation.{$conversation->id}")
        ->and($event->broadcastAs())->toBe('message.sent')
        ->and($event->broadcastWith())->toEqual([
            'message' => [
                'id' => $message->id,
                'conversation_id' => $conversation->id,
                'sender_id' => $sender->id,
                'body' => 'Hello there',
                'created_at' => $message->created_at,
            ],
        ]);
});

test('the conversation updated event broadcasts on each participant user channel', function () {
    $user = User::factory()->create();
    $other = User::factory()->create();
    $conversation = directConversation($user, $other);

    $conversation->messages()->create([
        'sender_id' => $user->id,
        'body' => 'Hello there',
    ]);

    $event = new ConversationUpdated(
        $conversation->load(['users:id,name', 'latestMessage'])
    );

    $channels = array_map(
        fn (PrivateChannel $channel) => $channel->name,
        $event->broadcastOn()
    );

    $payload = $event->broadcastWith()['conversation'];

    expect($channels)->toEqualCanonicalizing([
        "private-user.{$user->id}",
        "private-user.{$other->id}",
    ])
        ->and($event->broadcastAs())->toBe('conversation.updated')
        ->and($payload['id'])->toBe($conversation->id)
        ->and($payload['latest_message']['body'])->toBe('Hello there')
        ->and($payload['users'])->toHaveCount(2)
        ->and($payload['updated_at'])->toBeString();
});

test('users can authenticate to their own user channel', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->postJson('/api/broadcasting/auth', [
            'socket_id' => '1234.5678',
            'channel_name' => "private-user.{$user->id}",
        ])
        ->assertOk()
        ->assertJsonStructure(['auth']);
});

test('users cannot authenticate to another user channel', function () {
    $user = User::factory()->create();
    $other = User::factory()->create();

    $this->actingAs($user)
        ->postJson('/api/broadcasting/auth', [
            'socket_id' => '1234.5678',
            'channel_name' => "private-user.{$other->id}",
        ])
        ->assertForbidden();
});

test('conversation members can authenticate to the private conversation channel', function () {
    $member = User::factory()->create();
    $conversation = directConversation($member, User::factory()->create());

    $this->actingAs($member)
        ->postJson('/api/broadcasting/auth', [
            'socket_id' => '1234.5678',
            'channel_name' => "private-conversation.{$conversation->id}",
        ])
        ->assertOk()
        ->assertJsonStructure(['auth']);
});

test('users who are not members of the conversation cannot authenticate to its channel', function () {
    $conversation = directConversation(
        User::factory()->create(),
        User::factory()->create()
    );

    $this->actingAs(User::factory()->create())
        ->postJson('/api/broadcasting/auth', [
            'socket_id' => '1234.5678',
            'channel_name' => "private-conversation.{$conversation->id}",
        ])
        ->assertForbidden();
});

test('guests cannot authenticate to the private conversation channel', function () {
    $conversation = directConversation(
        User::factory()->create(),
        User::factory()->create()
    );

    $this->postJson('/api/broadcasting/auth', [
        'socket_id' => '1234.5678',
        'channel_name' => "private-conversation.{$conversation->id}",
    ])->assertUnauthorized();
});
