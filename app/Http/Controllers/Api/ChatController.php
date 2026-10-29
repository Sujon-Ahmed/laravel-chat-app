<?php

namespace App\Http\Controllers\Api;

use App\Events\ConversationUpdated;
use App\Events\MessageSent;
use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ChatController extends Controller
{
    public function users(Request $request)
    {
        return User::query()
            ->where('id', '!=', $request->user()->id)
            ->when($request->query('q'), function ($query, $search) {
                $query->where('name', 'like', "%{$search}%");
            })
            ->orderBy('name')
            ->limit(20)
            ->get(['id', 'name']);
    }

    public function index(Request $request)
    {
        return Conversation::query()
            ->whereHas(
                'users',
                fn ($query) => $query->whereKey($request->user()->id)
            )
            ->with(['users:id,name', 'latestMessage'])
            ->withCount([
                'messages as unread_count' => function ($query) use ($request) {
                    $query->where('sender_id', '!=', $request->user()->id)
                        ->where('id', '>', function ($subQuery) use ($request) {
                            $subQuery->selectRaw('COALESCE(conversation_user.last_read_message_id, 0)')
                                ->from('conversation_user')
                                ->whereColumn('conversation_user.conversation_id', 'conversations.id')
                                ->where('conversation_user.user_id', $request->user()->id);
                        });
                },
            ])
            ->latest('updated_at')
            ->paginate(20);
    }

    public function read(Request $request, Conversation $conversation)
    {
        $this->authorizeMember($request, $conversation);

        DB::table('conversation_user')
            ->where('conversation_id', $conversation->id)
            ->where('user_id', $request->user()->id)
            ->update([
                'last_read_message_id' => $conversation->messages()->max('id'),
            ]);

        return response()->json(['unread_count' => 0]);
    }

    public function start(Request $request)
    {
        $data = $request->validate([
            'recipient_id' => [
                'required',
                'integer',
                'exists:users,id',
                Rule::notIn([$request->user()->id]),
            ],
        ]);

        $ids = [
            $request->user()->id,
            (int) $data['recipient_id'],
        ];

        sort($ids, SORT_NUMERIC);

        $conversation = DB::transaction(function () use ($ids) {
            $conversation = Conversation::firstOrCreate(
                ['direct_key' => implode(':', $ids)],
                ['type' => 'direct']
            );

            foreach ($ids as $id) {
                DB::table('conversation_user')->insertOrIgnore([
                    'conversation_id' => $conversation->id,
                    'user_id' => $id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            return $conversation;
        });

        $conversation->load(['users:id,name', 'latestMessage']);

        if ($conversation->wasRecentlyCreated) {
            event(new ConversationUpdated($conversation));
        }

        return response()->json(
            $conversation->load('users:id,name'),
            201
        );
    }

    public function messages(Request $request, Conversation $conversation)
    {
        $this->authorizeMember($request, $conversation);

        return $conversation->messages()
            ->with('sender:id,name')
            ->latest('id')
            ->paginate(30);
    }

    public function send(Request $request, Conversation $conversation)
    {
        $this->authorizeMember($request, $conversation);

        $data = $request->validate([
            'body' => 'required|string|max:5000',
        ]);

        $message = $conversation->messages()->create([
            'sender_id' => $request->user()->id,
            'body' => $data['body'],
        ]);

        $conversation->touch();
        $message->load('sender:id,name');
        $conversation->load(['users:id,name', 'latestMessage']);

        event(new MessageSent($message));
        event(new ConversationUpdated($conversation));

        return response()->json($message, 201);
    }

    private function authorizeMember(
        Request $request,
        Conversation $conversation
    ): void {
        abort_unless(
            $conversation->users()
                ->where('users.id', $request->user()->id)
                ->exists(),
            403
        );
    }
}
