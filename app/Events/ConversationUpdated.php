<?php

namespace App\Events;

use App\Models\Conversation;
use App\Models\User;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;

class ConversationUpdated implements ShouldBroadcast
{
    use Dispatchable;

    public function __construct(public Conversation $conversation) {}

    /**
     * @return array<int, PrivateChannel>
     */
    public function broadcastOn(): array
    {
        $this->conversation->loadMissing(['users:id,name', 'latestMessage']);

        return $this->conversation->users
            ->map(fn (User $user) => new PrivateChannel('user.'.$user->id))
            ->all();
    }

    public function broadcastAs(): string
    {
        return 'conversation.updated';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        $this->conversation->loadMissing(['users:id,name', 'latestMessage']);

        $latestMessage = $this->conversation->latestMessage;

        return [
            'conversation' => [
                'id' => $this->conversation->id,
                'users' => $this->conversation->users
                    ->map(fn (User $user) => [
                        'id' => $user->id,
                        'name' => $user->name,
                    ])
                    ->all(),
                'latest_message' => $latestMessage ? [
                    'id' => $latestMessage->id,
                    'sender_id' => $latestMessage->sender_id,
                    'body' => $latestMessage->body,
                    'created_at' => $latestMessage->created_at->toISOString(),
                ] : null,
                'updated_at' => $this->conversation->updated_at->toISOString(),
            ],
        ];
    }
}
