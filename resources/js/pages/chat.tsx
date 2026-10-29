import { Head, Link, router } from '@inertiajs/react';
import axios from 'axios';
import {
    ArrowLeft,
    LoaderCircle,
    MessageSquare,
    Plus,
    Search,
    Send,
} from 'lucide-react';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn, initials } from '@/lib/utils';
import '../../js/echo';

axios.defaults.withCredentials = true;
axios.defaults.withXSRFToken = true;
axios.defaults.headers.common['Accept'] = 'application/json';

type UserSummary = {
    id: number;
    name: string;
};

type Message = {
    id: number;
    conversation_id: number;
    sender_id: number;
    body: string;
    created_at: string;
};

type ConversationSummary = {
    id: number;
    users: UserSummary[];
    latest_message: {
        id: number;
        sender_id: number;
        body: string;
        created_at: string;
    } | null;
    unread_count: number;
    updated_at: string;
};

type PaginatedConversations = {
    data: ConversationSummary[];
    current_page: number;
    last_page: number;
    total: number;
};

type Props = {
    conversationId: number | null;
    currentUserId: number;
    otherUser: UserSummary | null;
};

const timeFormat = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
});

const dateFormat = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
});

const shortDateFormat = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
});

const dayStart = (date: Date): number =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const dayLabel = (date: Date): string => {
    const today = dayStart(new Date());
    const day = dayStart(date);

    if (day === today) {
        return 'Today';
    }

    if (today - day === 24 * 60 * 60 * 1000) {
        return 'Yesterday';
    }

    return dateFormat.format(date);
};

const listTimestamp = (value: string): string => {
    const date = new Date(value);

    return dayStart(date) === dayStart(new Date())
        ? timeFormat.format(date)
        : shortDateFormat.format(date);
};

const otherParticipant = (
    conversation: ConversationSummary,
    currentUserId: number,
): UserSummary | null =>
    conversation.users.find((user) => user.id !== currentUserId) ?? null;

const byRecentActivity = (
    first: ConversationSummary,
    second: ConversationSummary,
): number =>
    new Date(second.updated_at).getTime() -
    new Date(first.updated_at).getTime();

export default function Chat({
    conversationId,
    currentUserId,
    otherUser,
}: Props) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [messagesLoading, setMessagesLoading] = useState(
        conversationId !== null,
    );
    const [sending, setSending] = useState(false);
    const [conversations, setConversations] = useState<ConversationSummary[]>(
        [],
    );
    const [conversationsLoading, setConversationsLoading] = useState(true);
    const [conversationsPage, setConversationsPage] = useState(1);
    const [conversationsLastPage, setConversationsLastPage] = useState(1);
    const [conversationsTotal, setConversationsTotal] = useState(0);
    const [loadingMore, setLoadingMore] = useState(false);
    const [people, setPeople] = useState<UserSummary[]>([]);
    const [search, setSearch] = useState('');
    const [searchResults, setSearchResults] = useState<UserSummary[]>([]);
    const [searching, setSearching] = useState(false);
    const [startingChatFor, setStartingChatFor] = useState<number | null>(null);
    const scrollContainer = useRef<HTMLDivElement>(null);

    const otherName = otherUser?.name ?? 'Conversation';
    const isSearching = search.trim().length > 0;

    const loadConversations = useCallback((page = 1) => {
        if (page === 1) {
            setConversationsLoading(true);
        } else {
            setLoadingMore(true);
        }

        axios
            .get<PaginatedConversations>('/api/conversations', {
                params: { page },
            })
            .then((response) => {
                setConversationsPage(response.data.current_page);
                setConversationsLastPage(response.data.last_page);
                setConversationsTotal(response.data.total);
                setConversations((previous) => {
                    const merged = new Map(
                        previous.map((conversation) => [
                            conversation.id,
                            conversation,
                        ]),
                    );

                    response.data.data.forEach((conversation) => {
                        merged.set(conversation.id, conversation);
                    });

                    return [...merged.values()].sort(byRecentActivity);
                });
            })
            .catch(() => {
                toast.error('Your conversations could not be loaded.');
            })
            .finally(() => {
                setConversationsLoading(false);
                setLoadingMore(false);
            });
    }, []);

    const markConversationRead = useCallback((id: number) => {
        setConversations((previous) =>
            previous.map((conversation) =>
                conversation.id === id
                    ? { ...conversation, unread_count: 0 }
                    : conversation,
            ),
        );

        axios.post(`/api/conversations/${id}/read`).catch(() => {
            // Read tracking is best effort; messages still load without it.
        });
    }, []);

    useEffect(() => {
        loadConversations();

        axios
            .get<UserSummary[]>('/api/chat/users')
            .then((response) => {
                setPeople(response.data);
            })
            .catch(() => {
                toast.error('People could not be loaded.');
            });
    }, [loadConversations]);

    useEffect(() => {
        const query = search.trim();

        if (query === '') {
            setSearchResults([]);
            setSearching(false);

            return;
        }

        setSearching(true);

        const timer = setTimeout(() => {
            axios
                .get<UserSummary[]>('/api/chat/users', { params: { q: query } })
                .then((response) => {
                    setSearchResults(response.data);
                })
                .catch(() => {
                    toast.error('People could not be loaded.');
                })
                .finally(() => {
                    setSearching(false);
                });
        }, 250);

        return () => {
            clearTimeout(timer);
        };
    }, [search]);

    useEffect(() => {
        if (conversationId === null) {
            setMessages([]);
            setMessagesLoading(false);

            return;
        }

        let cancelled = false;

        setMessages([]);
        setMessagesLoading(true);

        axios
            .get<{ data: Message[] }>(
                `/api/conversations/${conversationId}/messages`,
            )
            .then((response) => {
                if (!cancelled) {
                    setMessages(response.data.data.reverse());
                    markConversationRead(conversationId);
                }
            })
            .catch(() => {
                toast.error('Your messages could not be loaded.');
            })
            .finally(() => {
                if (!cancelled) {
                    setMessagesLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [conversationId, markConversationRead]);

    useEffect(() => {
        const channel = window.Echo.private(`user.${currentUserId}`);

        channel.listen(
            '.conversation.updated',
            (event: { conversation: ConversationSummary }) => {
                const incoming = event.conversation;
                const isOpen = incoming.id === conversationId;

                if (isOpen) {
                    markConversationRead(incoming.id);
                }

                setConversations((previous) => {
                    const existing = previous.find(
                        (conversation) => conversation.id === incoming.id,
                    );

                    const existingMessageId = existing?.latest_message?.id ?? 0;
                    const incomingMessageId = incoming.latest_message?.id ?? 0;

                    // The same event can be delivered more than once (for
                    // example after a reconnect), so never re-count a message
                    // the sidebar already knows about.
                    if (
                        existing &&
                        (incomingMessageId <= existingMessageId ||
                            new Date(existing.updated_at).getTime() >
                                new Date(incoming.updated_at).getTime())
                    ) {
                        return previous;
                    }

                    const isFromOther =
                        incoming.latest_message !== null &&
                        incoming.latest_message.sender_id !== currentUserId;

                    const unreadCount = isOpen
                        ? 0
                        : (existing?.unread_count ?? 0) + (isFromOther ? 1 : 0);

                    return [
                        ...previous.filter(
                            (conversation) => conversation.id !== incoming.id,
                        ),
                        { ...incoming, unread_count: unreadCount },
                    ].sort(byRecentActivity);
                });
            },
        );

        return () => {
            window.Echo.leave(`user.${currentUserId}`);
        };
    }, [conversationId, currentUserId, markConversationRead]);

    const updateConversationPreview = useCallback((message: Message) => {
        setConversations((previous) => {
            if (
                !previous.some(
                    (conversation) =>
                        conversation.id === message.conversation_id,
                )
            ) {
                return previous;
            }

            return previous
                .map((conversation) =>
                    conversation.id === message.conversation_id
                        ? {
                              ...conversation,
                              latest_message: {
                                  id: message.id,
                                  sender_id: message.sender_id,
                                  body: message.body,
                                  created_at: message.created_at,
                              },
                              updated_at: message.created_at,
                          }
                        : conversation,
                )
                .sort(
                    (first, second) =>
                        new Date(second.updated_at).getTime() -
                        new Date(first.updated_at).getTime(),
                );
        });
    }, []);

    useEffect(() => {
        if (conversationId === null) {
            return;
        }

        const channel = window.Echo.private(`conversation.${conversationId}`);

        channel.listen('.message.sent', (event: { message: Message }) => {
            setMessages((previous) => {
                if (
                    previous.some((message) => message.id === event.message.id)
                ) {
                    return previous;
                }

                return [...previous, event.message];
            });

            updateConversationPreview(event.message);
            markConversationRead(conversationId);
        });

        return () => {
            window.Echo.leave(`conversation.${conversationId}`);
        };
    }, [conversationId, updateConversationPreview]);

    useEffect(() => {
        const container = scrollContainer.current;

        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }, [messages.length, messagesLoading]);

    const openConversationWith = async (person: UserSummary) => {
        setStartingChatFor(person.id);

        try {
            const response = await axios.post<{ id: number }>(
                '/api/conversations',
                { recipient_id: person.id },
            );

            setSearch('');
            router.visit(`/chat/${response.data.id}`);
        } catch {
            toast.error('The conversation could not be started.');
        } finally {
            setStartingChatFor(null);
        }
    };

    const sendMessage = async (event: FormEvent) => {
        event.preventDefault();

        const body = input.trim();

        if (!body || sending || conversationId === null) {
            return;
        }

        setSending(true);

        try {
            const response = await axios.post<Message>(
                `/api/conversations/${conversationId}/messages`,
                { body },
            );

            setMessages((previous) => {
                if (
                    previous.some((message) => message.id === response.data.id)
                ) {
                    return previous;
                }

                return [...previous, response.data];
            });

            updateConversationPreview(response.data);
            setInput('');
        } catch {
            toast.error('Your message could not be sent.');
        } finally {
            setSending(false);
        }
    };

    const renderPerson = (person: UserSummary) => (
        <button
            key={person.id}
            type="button"
            onClick={() => void openConversationWith(person)}
            disabled={startingChatFor !== null}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed"
        >
            <Avatar className="size-9">
                <AvatarFallback className="text-xs font-medium">
                    {initials(person.name)}
                </AvatarFallback>
            </Avatar>

            <span className="min-w-0 flex-1 truncate text-sm">
                {person.name}
            </span>

            {startingChatFor === person.id ? (
                <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
                <Plus className="size-4 shrink-0 text-muted-foreground" />
            )}
        </button>
    );

    const renderConversation = (conversation: ConversationSummary) => {
        const participant = otherParticipant(conversation, currentUserId);
        const isActive = conversation.id === conversationId;
        const preview = conversation.latest_message;
        const unread = isActive ? 0 : (conversation.unread_count ?? 0);
        const name = participant?.name ?? 'Conversation';

        return (
            <button
                key={conversation.id}
                type="button"
                onClick={() => router.visit(`/chat/${conversation.id}`)}
                className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted',
                    isActive && 'bg-muted',
                )}
            >
                <Avatar className="size-9">
                    <AvatarFallback className="text-xs font-medium">
                        {initials(name)}
                    </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                        <p
                            className={cn(
                                'truncate text-sm',
                                unread > 0 ? 'font-semibold' : 'font-medium',
                            )}
                        >
                            {name}
                        </p>

                        {preview && (
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                                {listTimestamp(preview.created_at)}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                        <p
                            className={cn(
                                'truncate text-xs',
                                unread > 0
                                    ? 'font-medium text-foreground'
                                    : 'text-muted-foreground',
                            )}
                        >
                            {preview?.body ?? 'No messages yet'}
                        </p>

                        {unread > 0 && (
                            <Badge
                                aria-label={`${unread} unread message${
                                    unread === 1 ? '' : 's'
                                }`}
                                className="h-5 min-w-5 shrink-0 justify-center rounded-full px-1.5 text-[11px] tabular-nums"
                            >
                                {unread > 99 ? '99+' : unread}
                            </Badge>
                        )}
                    </div>
                </div>
            </button>
        );
    };

    return (
        <>
            <Head
                title={
                    conversationId === null ? 'Chats' : `Chat with ${otherName}`
                }
            />

            <div className="flex h-[calc(100svh-4rem)] flex-col p-4">
                <Card className="flex min-h-0 flex-1 flex-row gap-0 overflow-hidden p-0">
                    <aside
                        className={cn(
                            'w-full shrink-0 flex-col border-b md:w-80 md:border-r md:border-b-0',
                            conversationId === null ? 'flex' : 'hidden md:flex',
                        )}
                    >
                        <div className="space-y-1 border-b px-4 py-3">
                            <p className="text-sm font-semibold">Chats</p>

                            <p className="text-xs text-muted-foreground">
                                {conversationsLoading
                                    ? 'Loading…'
                                    : `${conversationsTotal} conversation${
                                          conversationsTotal === 1 ? '' : 's'
                                      }`}
                            </p>
                        </div>

                        <div className="border-b p-3">
                            <div className="relative">
                                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />

                                <Input
                                    value={search}
                                    onChange={(event) =>
                                        setSearch(event.target.value)
                                    }
                                    placeholder="Search people…"
                                    aria-label="Search people"
                                    autoComplete="off"
                                    className="pl-8"
                                />
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                            {isSearching ? (
                                <>
                                    <p className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                                        People
                                    </p>

                                    {searching && searchResults.length === 0 ? (
                                        <div className="flex justify-center py-6">
                                            <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : searchResults.length === 0 ? (
                                        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                                            No one matches “{search.trim()}”.
                                        </p>
                                    ) : (
                                        searchResults.map(renderPerson)
                                    )}
                                </>
                            ) : (
                                <>
                                    <p className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                                        Conversations
                                    </p>

                                    {conversationsLoading ? (
                                        <div className="flex justify-center py-6">
                                            <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : conversations.length === 0 ? (
                                        <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                                            No conversations yet. Pick someone
                                            below to start one.
                                        </p>
                                    ) : (
                                        conversations.map(renderConversation)
                                    )}

                                    {conversationsPage <
                                        conversationsLastPage && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="w-full text-xs text-muted-foreground"
                                            onClick={() =>
                                                loadConversations(
                                                    conversationsPage + 1,
                                                )
                                            }
                                            disabled={loadingMore}
                                        >
                                            {loadingMore ? (
                                                <LoaderCircle className="size-3.5 animate-spin" />
                                            ) : (
                                                'Load more conversations'
                                            )}
                                        </Button>
                                    )}

                                    <p className="px-2 pt-4 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                                        Start a new chat
                                    </p>

                                    {people.length === 0 ? (
                                        <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                                            No other users yet.
                                        </p>
                                    ) : (
                                        people.map(renderPerson)
                                    )}
                                </>
                            )}
                        </div>
                    </aside>

                    <section
                        className={cn(
                            'min-h-0 min-w-0 flex-1 flex-col',
                            conversationId === null ? 'hidden md:flex' : 'flex',
                        )}
                    >
                        {conversationId === null ? (
                            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                                    <MessageSquare className="size-5 text-muted-foreground" />
                                </div>

                                <p className="text-sm font-medium">
                                    No conversation selected
                                </p>

                                <p className="max-w-xs text-sm text-muted-foreground">
                                    Pick a conversation or search for someone to
                                    start a new chat.
                                </p>
                            </div>
                        ) : (
                            <>
                                <header className="flex items-center gap-3 border-b px-4 py-3">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        asChild
                                        className="md:hidden"
                                    >
                                        <Link
                                            href="/chat"
                                            aria-label="Back to chats"
                                        >
                                            <ArrowLeft className="size-4" />
                                        </Link>
                                    </Button>

                                    <Avatar className="size-10">
                                        <AvatarFallback className="text-sm font-medium">
                                            {initials(otherName)}
                                        </AvatarFallback>
                                    </Avatar>

                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold">
                                            {otherName}
                                        </p>

                                        <p className="text-xs text-muted-foreground">
                                            Direct message
                                        </p>
                                    </div>
                                </header>

                                <div
                                    ref={scrollContainer}
                                    className="min-h-0 flex-1 overflow-y-auto px-4 py-6"
                                >
                                    {messagesLoading ? (
                                        <div className="flex h-full items-center justify-center">
                                            <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : messages.length === 0 ? (
                                        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                                            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                                                <MessageSquare className="size-5 text-muted-foreground" />
                                            </div>

                                            <p className="text-sm font-medium">
                                                No messages yet
                                            </p>

                                            <p className="max-w-xs text-sm text-muted-foreground">
                                                Send the first message to start
                                                the conversation with{' '}
                                                {otherName}.
                                            </p>
                                        </div>
                                    ) : (
                                        messages.map((message, index) => {
                                            const createdAt = new Date(
                                                message.created_at,
                                            );
                                            const previous =
                                                messages[index - 1];
                                            const startsNewDay =
                                                !previous ||
                                                dayStart(
                                                    new Date(
                                                        previous.created_at,
                                                    ),
                                                ) !== dayStart(createdAt);
                                            const isOwn =
                                                message.sender_id ===
                                                currentUserId;

                                            return (
                                                <Fragment key={message.id}>
                                                    {startsNewDay && (
                                                        <div className="my-6 flex items-center gap-3 first:mt-0">
                                                            <div className="h-px flex-1 bg-border" />

                                                            <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                                                                {dayLabel(
                                                                    createdAt,
                                                                )}
                                                            </span>

                                                            <div className="h-px flex-1 bg-border" />
                                                        </div>
                                                    )}

                                                    <div
                                                        className={cn(
                                                            'mb-3 flex w-full items-end gap-2',
                                                            isOwn &&
                                                                'flex-row-reverse',
                                                        )}
                                                    >
                                                        {!isOwn && (
                                                            <Avatar className="mb-5 size-8">
                                                                <AvatarFallback className="text-[11px] font-medium">
                                                                    {initials(
                                                                        otherName,
                                                                    )}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                        )}

                                                        <div
                                                            className={cn(
                                                                'flex max-w-[75%] min-w-0 flex-col gap-1',
                                                                isOwn
                                                                    ? 'items-end'
                                                                    : 'items-start',
                                                            )}
                                                        >
                                                            <div
                                                                className={cn(
                                                                    'rounded-2xl px-4 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap',
                                                                    isOwn
                                                                        ? 'rounded-br-md bg-primary text-primary-foreground'
                                                                        : 'rounded-bl-md bg-muted text-foreground',
                                                                )}
                                                            >
                                                                {message.body}
                                                            </div>

                                                            <span className="px-1 text-[11px] text-muted-foreground">
                                                                {timeFormat.format(
                                                                    createdAt,
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </Fragment>
                                            );
                                        })
                                    )}
                                </div>

                                <form
                                    onSubmit={sendMessage}
                                    className="border-t p-3"
                                    aria-label="Send a message"
                                >
                                    <div className="flex items-center gap-2 rounded-xl border bg-background p-1.5 shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
                                        <Input
                                            value={input}
                                            onChange={(event) =>
                                                setInput(event.target.value)
                                            }
                                            placeholder={`Message ${otherName}…`}
                                            aria-label="Message"
                                            autoComplete="off"
                                            disabled={sending}
                                            className="h-9 border-0 bg-transparent shadow-none focus-visible:border-0 focus-visible:ring-0"
                                        />

                                        <Button
                                            type="submit"
                                            size="icon"
                                            className="size-9 shrink-0 rounded-lg"
                                            disabled={!input.trim() || sending}
                                            aria-label="Send message"
                                        >
                                            {sending ? (
                                                <LoaderCircle className="size-4 animate-spin" />
                                            ) : (
                                                <Send className="size-4" />
                                            )}
                                        </Button>
                                    </div>
                                </form>
                            </>
                        )}
                    </section>
                </Card>
            </div>
        </>
    );
}
