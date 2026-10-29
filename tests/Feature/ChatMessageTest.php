<?php

use App\Events\ConversationUpdated;
use App\Events\MessageSent;
use App\Models\Conversation;
use App\Models\User;
use Illuminate\Broadcasting\BroadcastEvent;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Inertia\Testing\AssertableInertia as Assert;

test('sending a message stores it and broadcasts the message sent event', function () {
    Event::fake([MessageSent::class, ConversationUpdated::class]);

    $sender = User::factory()->create();
    $conversation = directConversation($sender, User::factory()->create());

    $this->actingAs($sender)
        ->postJson("/api/conversations/{$conversation->id}/messages", [
            'body' => 'Hello there',
        ])
        ->assertCreated()
        ->assertJsonPath('body', 'Hello there');

    $this->assertDatabaseHas('messages', [
        'conversation_id' => $conversation->id,
        'sender_id' => $sender->id,
        'body' => 'Hello there',
    ]);

    Event::assertDispatched(
        MessageSent::class,
        fn (MessageSent $event) => $event->message->body === 'Hello there'
            && $event->broadcastOn()[0]->name === "private-conversation.{$conversation->id}"
    );

    Event::assertDispatched(
        ConversationUpdated::class,
        fn (ConversationUpdated $event) => $event->conversation->id === $conversation->id
    );
});

test('sending a message queues the broadcast instead of broadcasting inline', function () {
    Queue::fake();

    $sender = User::factory()->create();
    $conversation = directConversation($sender, User::factory()->create());

    $this->actingAs($sender)
        ->postJson("/api/conversations/{$conversation->id}/messages", [
            'body' => 'Queued hello',
        ])
        ->assertCreated();

    Queue::assertPushed(
        BroadcastEvent::class,
        fn (BroadcastEvent $job) => $job->event instanceof MessageSent
            && $job->event->message->body === 'Queued hello'
    );
});

test('the chat index page is available to authenticated users', function () {
    $this->actingAs(User::factory()->create())
        ->get('/chat')
        ->assertOk()
        ->assertInertia(
            fn (Assert $page) => $page
                ->component('chat')
                ->where('conversationId', null)
                ->where('otherUser', null)
        );
});

test('starting a conversation creates one direct conversation and reuses it', function () {
    Event::fake([ConversationUpdated::class]);

    $user = User::factory()->create();
    $recipient = User::factory()->create();

    $first = $this->actingAs($user)
        ->postJson('/api/conversations', ['recipient_id' => $recipient->id])
        ->assertCreated();

    Event::assertDispatchedTimes(ConversationUpdated::class, 1);

    $second = $this->actingAs($user)
        ->postJson('/api/conversations', ['recipient_id' => $recipient->id])
        ->assertCreated();

    expect($second->json('id'))->toBe($first->json('id'))
        ->and(Conversation::count())->toBe(1)
        ->and($first->json('users'))->toHaveCount(2);

    Event::assertDispatchedTimes(ConversationUpdated::class, 1);
});

test('members can open the chat page and see the other participant', function () {
    $member = User::factory()->create();
    $other = User::factory()->create(['name' => 'Taylor Otwell']);
    $conversation = directConversation($member, $other);

    $this->actingAs($member)
        ->get("/chat/{$conversation->id}")
        ->assertOk()
        ->assertInertia(
            fn (Assert $page) => $page
                ->component('chat')
                ->where('conversationId', $conversation->id)
                ->where('currentUserId', $member->id)
                ->where('otherUser.id', $other->id)
                ->where('otherUser.name', 'Taylor Otwell')
        );
});

test('users who are not members of the conversation cannot send messages', function () {
    Event::fake([MessageSent::class]);

    $conversation = directConversation(
        User::factory()->create(),
        User::factory()->create()
    );

    $this->actingAs(User::factory()->create())
        ->postJson("/api/conversations/{$conversation->id}/messages", [
            'body' => 'Not allowed',
        ])
        ->assertForbidden();

    Event::assertNotDispatched(MessageSent::class);
});
